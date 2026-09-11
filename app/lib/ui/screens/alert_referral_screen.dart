import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../../core/app_theme.dart';
import '../../models/clinical_alert.dart';
import '../../models/pregnancy.dart';
import '../../models/referral.dart';
import '../../services/service_locator.dart';
import '../widgets/shared.dart';

/// Manual "RECORD ALERT" / "REFERRAL" entry from the mother profile.
///
/// Referral form, per the design spec:
///   Mother / ID, Reason, Urgency, Referred to, Date/time, Transport,
///   Clinical notes, [SAVE REFERRAL]
class AlertReferralScreen extends StatefulWidget {
  const AlertReferralScreen({
    super.key,
    required this.pregnancy,
    this.referralMode = false,
  });

  final Pregnancy pregnancy;
  final bool referralMode;

  @override
  State<AlertReferralScreen> createState() => _AlertReferralScreenState();
}

class _AlertReferralScreenState extends State<AlertReferralScreen> {
  final _uuid = const Uuid();

  // Manual alert
  String _alertLevel = AlertLevel.amber;
  final _alertMessage = TextEditingController();

  // Referral
  final String _reason = 'Potential danger sign';
  String _urgency = ReferralUrgency.urgent;
  final _toName = TextEditingController();
  String _transport = 'Ambulance';
  final _notes = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _alertMessage.dispose();
    _toName.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _saveAlert() async {
    if (_alertMessage.text.trim().isEmpty) {
      _snack('Describe the finding (non-diagnostic).');
      return;
    }
    setState(() => _busy = true);
    final alert = ClinicalAlert(
      id: _uuid.v4(),
      pregnancyId: widget.pregnancy.id,
      ruleKey: 'manual_${_alertLevel}',
      level: _alertLevel,
      message: _alertMessage.text.trim(),
    );
    // Manual alerts are stored directly (no visit to attach to).
    await Services.database.insert('alerts', {
      'id': alert.id,
      'pregnancy_id': alert.pregnancyId,
      'visit_id': null,
      'rule_key': alert.ruleKey,
      'level': alert.level,
      'message': alert.message,
      'status': 'open',
      'assessed_by': null,
      'assessed_at': null,
      'action_taken': null,
      'created_at': DateTime.now().toIso8601String(),
      'row_version': 1,
    });
    await Services.sync.enqueue('alerts', alert.id);
    if (!mounted) return;
    setState(() => _busy = false);
    _snack('Alert recorded.');
    Navigator.of(context).pop();
  }

  Future<void> _saveReferral() async {
    final facilityId = Services.auth.facilityId;
    if (facilityId == null) {
      _snack('Facility not assigned to this account.');
      return;
    }
    setState(() => _busy = true);
    final referral = Referral(
      id: _uuid.v4(),
      pregnancyId: widget.pregnancy.id,
      reason: _reason,
      urgency: _urgency,
      referredFromFacilityId: facilityId,
      referredToName: _toName.text.trim().isNotEmpty
          ? _toName.text.trim()
          : 'Receiving facility',
      referredAt: DateTime.now(),
      transport: _transport,
      clinicalNotes: _notes.text.trim().isNotEmpty ? _notes.text.trim() : null,
      createdBy: Services.auth.userId,
    );
    await Services.repo.addReferral(referral);
    if (!mounted) return;
    setState(() => _busy = false);
    _snack('Referral saved — status: Referral active.');
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.referralMode ? 'New Referral' : 'Record Alert'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (widget.referralMode) ...[
            SectionCard(
              title: 'Referral',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _kv('Mother', _motherName),
                  const SizedBox(height: 8),
                  _kv('ID', _motherCode),
                  const SizedBox(height: 16),
                  const Text('Reason',
                      style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  DropdownButtonFormField<String>(
                    value: _reason,
                    decoration: const InputDecoration(labelText: 'Reason'),
                    items: const [
                      DropdownMenuItem(
                          value: 'Potential danger sign',
                          child: Text('Potential danger sign')),
                      DropdownMenuItem(
                          value: 'Hypertension in pregnancy',
                          child: Text('Hypertension in pregnancy')),
                      DropdownMenuItem(
                          value: 'Preterm labour',
                          child: Text('Preterm labour')),
                      DropdownMenuItem(
                          value: 'Haemorrhage',
                          child: Text('Haemorrhage')),
                      DropdownMenuItem(
                          value: 'Suspected obstructed labour',
                          child: Text('Suspected obstructed labour')),
                      DropdownMenuItem(
                          value: 'Other',
                          child: Text('Other')),
                    ],
                    onChanged: (v) => setState(() => _reason = v ?? _reason),
                  ),
                  const SizedBox(height: 16),
                  const Text('Urgency',
                      style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(
                          value: ReferralUrgency.emergency,
                          label: Text('Emergency')),
                      ButtonSegment(
                          value: ReferralUrgency.urgent,
                          label: Text('Urgent')),
                      ButtonSegment(
                          value: ReferralUrgency.routine,
                          label: Text('Routine')),
                    ],
                    selected: {_urgency},
                    onSelectionChanged: (s) =>
                        setState(() => _urgency = s.first),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                      controller: _toName,
                      decoration: const InputDecoration(
                          labelText: 'Referred to (facility name)',
                          hintText: 'e.g. Kafue District Hospital')),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                          child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Date / time',
                              style: TextStyle(
                                  fontWeight: FontWeight.w600)),
                          const SizedBox(height: 4),
                          Text(fmtDateTime(DateTime.now())),
                        ],
                      )),
                    ],
                  ),
                  const SizedBox(height: 16),
                  const Text('Transport',
                      style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: 'Ambulance', label: Text('Ambulance')),
                      ButtonSegment(value: 'Private', label: Text('Private')),
                      ButtonSegment(value: 'Other', label: Text('Other')),
                    ],
                    selected: {_transport},
                    onSelectionChanged: (s) =>
                        setState(() => _transport = s.first),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                      controller: _notes,
                      maxLines: 3,
                      decoration: const InputDecoration(
                          labelText: 'Clinical notes')),
                ],
              ),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              icon: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.local_hospital),
              label: const Text('SAVE REFERRAL'),
              onPressed: _busy ? null : _saveReferral,
            ),
            const SizedBox(height: 12),
            const Text(
              'The receiving facility will later record: Received → '
              'Assessment completed → Treatment → Admission / Discharged / '
              'Referred onward / Follow-up required.',
              style: TextStyle(fontSize: 12, color: AppTheme.muted),
            ),
          ] else ...[
            SectionCard(
              title: 'Manual alert',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Level',
                      style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(
                          value: AlertLevel.red,
                          label: Text(
                              'RED\nPotential emergency',
                              maxLines: 2)),
                      ButtonSegment(
                          value: AlertLevel.amber,
                          label: Text(
                              'AMBER\nConcerning finding',
                              maxLines: 2)),
                    ],
                    selected: {_alertLevel},
                    onSelectionChanged: (s) =>
                        setState(() => _alertLevel = s.first),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                      controller: _alertMessage,
                      maxLines: 3,
                      decoration: const InputDecoration(
                          labelText:
                              'Finding (non-diagnostic — e.g. "BP 150/95 with '
                              'mild headache, no other signs")')),
                  const SizedBox(height: 8),
                  const Text(
                    'The alert is a flag for clinical assessment — it is '
                    'never a diagnosis.',
                    style: TextStyle(fontSize: 12, color: AppTheme.muted),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              icon: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.report),
              label: const Text('RECORD ALERT'),
              onPressed: _busy ? null : _saveAlert,
            ),
          ],
        ],
      ),
    );
  }

  String get _motherName {
    // Loaded lazily below; placeholder until first build frame.
    return _motherNameCache ?? '…';
  }

  String get _motherCode => _motherCodeCache ?? '…';

  String? _motherNameCache;
  String? _motherCodeCache;

  @override
  void initState() {
    super.initState();
    _loadMother();
  }

  Future<void> _loadMother() async {
    final m =
        await Services.repo.getMother(widget.pregnancy.motherId);
    if (!mounted) return;
    setState(() {
      _motherNameCache = m?.fullName;
      _motherCodeCache = m?.displayCode;
    });
  }

  Widget _kv(String k, String v) => Row(
        children: [
          SizedBox(
              width: 90,
              child: Text(k, style: const TextStyle(color: AppTheme.muted))),
          Expanded(
              child:
                  Text(v, style: const TextStyle(fontWeight: FontWeight.w600))),
        ],
      );

  void _snack(String msg) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
}
