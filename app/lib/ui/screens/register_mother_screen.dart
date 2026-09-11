import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../../core/app_theme.dart';
import '../../models/mother.dart';
import '../../models/pregnancy.dart';
import '../../services/clinical/gestational_math.dart';
import '../../services/service_locator.dart';
import '../widgets/shared.dart';
import 'mother_profile_screen.dart';

/// Mother registration — two steps so nurses never face one giant form:
///  Step 1: personal information
///  Step 2: pregnancy information (GA + EDD computed automatically)
class RegisterMotherScreen extends StatefulWidget {
  const RegisterMotherScreen({super.key});

  @override
  State<RegisterMotherScreen> createState() => _RegisterMotherScreenState();
}

class _RegisterMotherScreenState extends State<RegisterMotherScreen> {
  final _uuid = const Uuid();
  int _step = 0;

  // Step 1
  final _name = TextEditingController();
  final _age = TextEditingController();
  final _phone = TextEditingController();
  final _address = TextEditingController();
  final _community = TextEditingController();
  final _ecName = TextEditingController();
  final _ecPhone = TextEditingController();
  String _language = 'English';

  // Step 2
  final _gravida = TextEditingController(text: '1');
  final _para = TextEditingController(text: '0');
  final DateTime _lmp = DateTime.now().subtract(const Duration(days: 120));
  final DateTime _confirmed = DateTime.now().subtract(const Duration(days: 60));
  String _multiple = 'single';
  bool _prevCs = false;
  final _riskFactors = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _age.dispose();
    _phone.dispose();
    _address.dispose();
    _community.dispose();
    _ecName.dispose();
    _ecPhone.dispose();
    _gravida.dispose();
    _para.dispose();
    _riskFactors.dispose();
    super.dispose();
  }

  Pregnancy _buildPregnancy() {
    final lmp = DateTime(_lmp.year, _lmp.month, _lmp.day);
    return Pregnancy(
      id: _uuid.v4(),
      motherId: '', // filled in _save
      gravida: int.tryParse(_gravida.text) ?? 1,
      para: int.tryParse(_para.text) ?? 0,
      lmpDate: lmp,
      eddDate: GestationalMath.eddFromLmp(lmp),
      confirmedDate: DateTime(_confirmed.year, _confirmed.month, _confirmed.day),
      multiplePregnancy: _multiple,
      previousCSection: _prevCs,
      riskFactors: _riskFactors.text
          .split(',')
          .map((e) => e.trim().replaceAll(' ', '_'))
          .where((e) => e.isNotEmpty)
          .toList(),
      createdAt: DateTime.now(),
    );
  }

  Future<void> _save() async {
    final facilityId = Services.auth.facilityId;
    if (facilityId == null) {
      _snack('This account has no facility assigned — an admin must set it.');
      return;
    }
    setState(() => _busy = true);
    final mother = Mother(
      id: _uuid.v4(),
      provisionalCode: 'MC-L-${_uuid.v4().substring(0, 8)}',
      fullName: _name.text.trim(),
      age: int.tryParse(_age.text),
      dateOfBirth: int.tryParse(_age.text) != null
          ? DateTime.now().subtract(
              Duration(days: 365 * (int.tryParse(_age.text)!)))
          : null,
      phone: _phone.text.trim(),
      address: _address.text.trim(),
      community: _community.text.trim(),
      emergencyContactName: _ecName.text.trim(),
      emergencyContactPhone: _ecPhone.text.trim(),
      preferredLanguage: _language,
      registrationFacilityId: facilityId,
      registeredBy: Services.auth.userId,
      createdAt: DateTime.now(),
    );
    final pregnancy = _buildPregnancy()
        .copyWithStatus(PregnancyStatus.active)
        ._withMother(mother.id);
    await Services.repo.registerMother(mother, pregnancy);
    if (!mounted) return;
    // Go straight to the new profile (GA + EDD visible immediately).
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => MotherProfileScreen(motherId: mother.id)),
      (route) => route.settings.name == null,
    );
  }

  @override
  Widget build(BuildContext context) {
    final pregnancy = _buildPregnancy();
    return Scaffold(
      appBar: AppBar(
        title: Text(_step == 0 ? 'Register Mother — Personal' : 'Register Mother — Pregnancy'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: LinearProgressIndicator(
                minHeight: 6, value: (_step + 1) / 2),
          ),
          Expanded(
            child: _step == 0
                ? ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      TextField(
                          controller: _name,
                          decoration: const InputDecoration(
                              labelText: 'Full name *',
                              hintText: 'e.g. Mary Phiri')),
                      const SizedBox(height: 12),
                      TextField(
                          controller: _age,
                          keyboardType: TextInputType.number,
                          decoration:
                              const InputDecoration(labelText: 'Age (years)')),
                      const SizedBox(height: 12),
                      TextField(
                          controller: _phone,
                          keyboardType: TextInputType.phone,
                          decoration: const InputDecoration(
                              labelText: 'Phone number',
                              hintText: '+260 97 7 000 000')),
                      const SizedBox(height: 12),
                      TextField(
                          controller: _address,
                          decoration: const InputDecoration(
                              labelText: 'Address')),
                      const SizedBox(height: 12),
                      TextField(
                          controller: _community,
                          decoration:
                              const InputDecoration(labelText: 'Community')),
                      const SizedBox(height: 12),
                      TextField(
                          controller: _ecName,
                          decoration: const InputDecoration(
                              labelText: 'Emergency contact — name')),
                      const SizedBox(height: 12),
                      TextField(
                          controller: _ecPhone,
                          keyboardType: TextInputType.phone,
                          decoration: const InputDecoration(
                              labelText: 'Emergency contact — phone')),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        value: _language,
                        decoration: const InputDecoration(
                            labelText: 'Preferred language'),
                        items: const [
                          DropdownMenuItem(value: 'English', child: Text('English')),
                          DropdownMenuItem(value: 'Nyanja', child: Text('Nyanja (Chewa)')),
                          DropdownMenuItem(value: 'Bemba', child: Text('Bemba')),
                          DropdownMenuItem(value: 'Lozi', child: Text('Lozi')),
                          DropdownMenuItem(value: 'Tonga', child: Text('Tonga')),
                        ],
                        onChanged: (v) =>
                            setState(() => _language = v ?? 'English'),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Patient ID is generated automatically on save.',
                        style: TextStyle(fontSize: 12, color: AppTheme.muted),
                      ),
                    ],
                  )
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Row(
                        children: [
                          Expanded(
                              child: TextField(
                                  controller: _gravida,
                                  keyboardType: TextInputType.number,
                                  decoration: const InputDecoration(
                                      labelText: 'Gravida'))),
                          const SizedBox(width: 12),
                          Expanded(
                              child: TextField(
                                  controller: _para,
                                  keyboardType: TextInputType.number,
                                  decoration:
                                      const InputDecoration(labelText: 'Para'))),
                        ],
                      ),
                      const SizedBox(height: 12),
                      InkWell(
                        onTap: () async {
                          final d = await showDatePicker(
                            context: context,
                            initialDate: _lmp,
                            firstDate: DateTime.now().subtract(
                                const Duration(days: 400)),
                            lastDate: DateTime.now(),
                          );
                          if (d != null) setState(() => _lmp = d);
                        },
                        child: InputDecorator(
                          decoration: const InputDecoration(
                              labelText: 'Last menstrual period (LMP) *'),
                          child: Text(fmtDate(_lmp),
                              style:
                                  const TextStyle(fontWeight: FontWeight.w600)),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppTheme.primary.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.calculate,
                                color: AppTheme.primary),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                'Calculated:  ${GestationalMath.gaLabel(_lmp)}  •  '
                                'EDD ${fmtDate(GestationalMath.eddFromLmp(_lmp))}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    color: AppTheme.primary),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      InkWell(
                        onTap: () async {
                          final d = await showDatePicker(
                              context: context,
                              initialDate: _confirmed,
                              firstDate:
                                  DateTime.now().subtract(const Duration(days: 400)),
                              lastDate: DateTime.now());
                          if (d != null) setState(() => _confirmed = d);
                        },
                        child: InputDecorator(
                          decoration: const InputDecoration(
                              labelText: 'Date pregnancy confirmed'),
                          child: Text(fmtDate(_confirmed)),
                        ),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        value: _multiple,
                        decoration: const InputDecoration(
                            labelText: 'Multiple pregnancy'),
                        items: const [
                          DropdownMenuItem(
                              value: 'single', child: Text('Single')),
                          DropdownMenuItem(
                              value: 'suspected_multiple',
                              child: Text('Multiple suspected')),
                          DropdownMenuItem(
                              value: 'confirmed_multiple',
                              child: Text('Multiple confirmed')),
                        ],
                        onChanged: (v) =>
                            setState(() => _multiple = v ?? 'single'),
                      ),
                      const SizedBox(height: 12),
                      SwitchListTile(
                          title: const Text('Previous C-section'),
                          value: _prevCs,
                          onChanged: (v) => setState(() => _prevCs = v)),
                      TextField(
                          controller: _riskFactors,
                          decoration: const InputDecoration(
                              labelText: 'Known risk factors (comma separated)',
                              hintText: 'e.g. hypertension, diabetes')),
                      const SizedBox(height: 12),
                      const Text(
                        'Previous pregnancy complications can be added later '
                        'in pregnancy details.',
                        style: TextStyle(fontSize: 12, color: AppTheme.muted),
                      ),
                    ],
                  ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                if (_step == 1)
                  Expanded(
                      child: OutlinedButton(
                          onPressed:
                              _busy ? null : () => setState(() => _step = 0),
                          child: const Text('BACK'))),
                if (_step == 1) const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: _busy
                        ? null
                        : _step == 0
                            ? () {
                                if (_name.text.trim().isEmpty) {
                                  _snack('Full name is required.');
                                  return;
                                }
                                setState(() => _step = 1);
                              }
                            : _save,
                    child: _busy
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : Text(_step == 0 ? 'CONTINUE' : 'SAVE MOTHER'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _snack(String msg) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(msg)));
}

/// Local helper: Pregnancy's motherId is set at registration time.
extension _WithMother on Pregnancy {
  Pregnancy _withMother(String motherId) => Pregnancy(
        id: id,
        motherId: motherId,
        gravida: gravida,
        para: para,
        previousComplications: previousComplications,
        lmpDate: lmpDate,
        eddDate: eddDate,
        confirmedDate: confirmedDate,
        multiplePregnancy: multiplePregnancy,
        previousCSection: previousCSection,
        riskFactors: riskFactors,
        status: status,
        createdAt: createdAt,
        rowVersion: rowVersion,
      );
}
