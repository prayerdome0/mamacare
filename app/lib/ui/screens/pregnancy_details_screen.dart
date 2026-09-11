import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../models/pregnancy.dart';
import '../../services/clinical/gestational_math.dart';
import '../../services/service_locator.dart';
import '../widgets/shared.dart';

/// Full pregnancy registration details (reached from the profile).
class PregnancyDetailsScreen extends StatefulWidget {
  const PregnancyDetailsScreen({super.key, required this.pregnancy});

  final Pregnancy pregnancy;

  @override
  State<PregnancyDetailsScreen> createState() => _PregnancyDetailsScreenState();
}

class _PregnancyDetailsScreenState extends State<PregnancyDetailsScreen> {
  late String _complications =
      widget.pregnancy.previousComplications.join(', ');
  late String _riskFactors = widget.pregnancy.riskFactors.join(', ');
  late bool _prevCs = widget.pregnancy.previousCSection;
  bool _busy = false;

  Future<void> _save() async {
    setState(() => _busy = true);
    // Persisted via a full local update + sync enqueue (v2 writes the
    // updated row back through the repository's pregnancy table).
    final db = Services.database;
    final row = await db.selectOne('pregnancies', widget.pregnancy.id);
    if (row != null) {
      await db.update(
          'pregnancies',
          {
            ...row,
            'previous_complications': _jsonList(_complications),
            'risk_factors': _jsonList(_riskFactors),
            'previous_c_section': _prevCs ? 1 : 0,
          },
          widget.pregnancy.id);
      await Services.sync.enqueue('pregnancies', widget.pregnancy.id);
    }
    if (!mounted) return;
    setState(() => _busy = false);
    Navigator.of(context).pop();
  }

  String _jsonList(String csv) {
    final items = csv
        .split(',')
        .map((e) => e.trim().replaceAll('"', ''))
        .where((e) => e.isNotEmpty)
        .toList();
    if (items.isEmpty) return '[]';
    return '[' + items.map((e) => '"$e"').join(',') + ']';
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.pregnancy;
    return Scaffold(
      appBar: AppBar(title: const Text('Pregnancy Details')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SectionCard(
            title: 'Pregnancy information',
            child: Column(
              children: [
                _kv('Gravida / Para', '${p.gravida} / ${p.para}'),
                const SizedBox(height: 10),
                _kv('Last menstrual period', fmtDate(p.lmpDate)),
                const SizedBox(height: 10),
                _kv('Gestational age', GestationalMath.gaLabel(p.lmpDate)),
                const SizedBox(height: 10),
                _kv('Estimated delivery date', fmtDate(p.eddDate)),
                const SizedBox(height: 10),
                _kv('Pregnancy confirmed', fmtDate(p.confirmedDate)),
                const SizedBox(height: 10),
                _kv('Multiple pregnancy',
                    p.multiplePregnancy.replaceAll('_', ' ')),
              ],
            ),
          ),
          const SizedBox(height: 16),
          SectionCard(
            title: 'History',
            child: Column(
              children: [
                SwitchListTile(
                    title: const Text('Previous C-section'),
                    value: _prevCs,
                    onChanged: (v) => setState(() => _prevCs = v)),
                TextField(
                  controller: _complications,
                  maxLines: 2,
                  decoration: const InputDecoration(
                      labelText:
                          'Previous pregnancy complications (comma separated)',
                      hintText: 'e.g. pre-eclampsia, postpartum haemorrhage'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _riskFactors,
                  maxLines: 2,
                  decoration: const InputDecoration(
                      labelText: 'Known risk factors (comma separated)',
                      hintText: 'e.g. hypertension, age > 35'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          FilledButton.icon(
            icon: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.save),
            label: const Text('SAVE CHANGES'),
            onPressed: _busy ? null : _save,
          ),
          const SizedBox(height: 16),
          const Text(
            'Gestational age and EDD are calculated automatically from the '
            'LMP (EDD = LMP + 280 days). To correct the LMP, re-register or '
            'update via an admin with database access.',
            style: TextStyle(fontSize: 12, color: AppTheme.muted),
          ),
        ],
      ),
    );
  }

  Widget _kv(String label, String value) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: AppTheme.muted)),
          Text(value,
              style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      );
}
