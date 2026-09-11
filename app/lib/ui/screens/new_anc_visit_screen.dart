import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../../core/app_theme.dart';
import '../../models/anc_visit.dart';
import '../../models/appointment.dart';
import '../../models/clinical_alert.dart';
import '../../models/danger_sign.dart';
import '../../models/pregnancy.dart';
import '../../models/vitals.dart';
import '../../services/clinical/alert_engine.dart';
import '../../services/clinical/gestational_math.dart';
import '../../services/service_locator.dart';
import '../widgets/shared.dart';
import 'alert_referral_screen.dart';
import 'mother_profile_screen.dart';

/// New ANC visit — divided into sections (A: visit, B: observations,
/// C: symptoms & danger signs) so nurses never face one giant form.
///
/// On save, the clinical alert engine evaluates the findings locally and,
/// if a rule fires, shows the alert panel:
///   🚨 "Potential danger sign — immediate clinical assessment required."
///   [ASSESS] [REFER] [DOCUMENT ACTION]
class NewAncVisitScreen extends StatefulWidget {
  const NewAncVisitScreen({super.key, required this.pregnancy});

  final Pregnancy pregnancy;

  @override
  State<NewAncVisitScreen> createState() => _NewAncVisitScreenState();
}

class _NewAncVisitScreenState extends State<NewAncVisitScreen> {
  final _uuid = const Uuid();

  // A. Visit information
  DateTime _visitDate = DateTime.now();
  final _reason = TextEditingController();
  String _visitType = VisitType.routine;

  // B. Maternal observations
  final _systolic = TextEditingController();
  final _diastolic = TextEditingController();
  final _pulse = TextEditingController();
  final _temp = TextEditingController();
  final _rr = TextEditingController();
  final _weight = TextEditingController();
  final _otherObs = TextEditingController();

  // C. Danger signs
  final Set<String> _signs = {};
  final String? _otherSignNote;

  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _reason.text = 'Routine ANC check';
  }

  @override
  void dispose() {
    _reason.dispose();
    _systolic.dispose();
    _diastolic.dispose();
    _pulse.dispose();
    _temp.dispose();
    _rr.dispose();
    _weight.dispose();
    _otherObs.dispose();
    super.dispose();
  }

  void _toggleSign(String key) {
    setState(() {
      if (key == DangerSignKeys.noneReported) {
        if (_signs.contains(key)) {
          _signs.remove(key);
        } else {
          _signs.clear();
          _signs.add(key);
        }
      } else {
        _signs.remove(DangerSignKeys.noneReported);
        if (_signs.contains(key)) {
          _signs.remove(key);
        } else {
          _signs.add(key);
        }
      }
    });
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    final lmp = widget.pregnancy.lmpDate;
    final (w, d) = GestationalMath.gaFromLmp(lmp, _visitDate);

    final visit = AncVisit(
      id: _uuid.v4(),
      pregnancyId: widget.pregnancy.id,
      visitNumber: await Services.repo.nextVisitNumber(widget.pregnancy.id),
      visitDate: DateTime(_visitDate.year, _visitDate.month, _visitDate.day),
      gaWeeks: w,
      gaDays: d,
      reason: _reason.text.trim(),
      visitType: _visitType,
      recordedBy: Services.auth.userId,
      createdAt: DateTime.now(),
    );

    final vitals = (
      int.tryParse(_systolic.text) != null ||
      int.tryParse(_diastolic.text) != null ||
      int.tryParse(_pulse.text) != null ||
      double.tryParse(_temp.text) != null ||
      int.tryParse(_rr.text) != null ||
      double.tryParse(_weight.text) != null ||
      (_otherObs.text.trim().isNotEmpty)
    )
        ? Vitals(
            id: _uuid.v4(),
            visitId: visit.id,
            systolicBp: int.tryParse(_systolic.text),
            diastolicBp: int.tryParse(_diastolic.text),
            pulse: int.tryParse(_pulse.text),
            temperatureC: double.tryParse(_temp.text),
            respiratoryRate: int.tryParse(_rr.text),
            weightKg: double.tryParse(_weight.text),
            otherObservations: _otherObs.text.trim(),
          )
        : null;

    final signRows = [
      for (final key in _signs.where((k) => k != DangerSignKeys.noneReported))
        DangerSignReport(
            id: _uuid.v4(), visitId: visit.id, signKey: key, reported: true),
      if (_signs.contains(DangerSignKeys.noneReported))
        DangerSignReport(
            id: _uuid.v4(),
            visitId: visit.id,
            signKey: DangerSignKeys.noneReported,
            reported: true),
    ];

    // Weight-loss rule needs the previous visit's weight.
    final lastV = await Services.repo.lastVitals(widget.pregnancy.id);

    final engine = AlertEngine(await _rules());
    final fired = engine.evaluate(
      pregnancyId: widget.pregnancy.id,
      visitId: visit.id,
      vitals: vitals,
      reportedSignKeys: _signs.toSet(),
      previousWeightKg: lastV?.weightKg,
    );

    await Services.repo.saveVisit(
      visit: visit,
      vitals: vitals,
      dangerSigns: signRows,
      tests: const [],
      alerts: fired,
    );

    // Trigger a background sync attempt (no-op while offline).
    unawaitedSync();

    if (!mounted) return;
    setState(() => _busy = false);

    // RED alerts get an immediate local notification.
    if (fired.any((a) => a.level == AlertLevel.red)) {
      final mother = await Services.repo.getMother(widget.pregnancy.motherId);
      await Services.reminders.notifyRedAlert(mother?.fullName ?? 'mother');
    }

    if (fired.isNotEmpty) {
      _showAlertPanel(fired);
    } else {
      _showNextAppointment();
    }
  }

  Future<List<AlertRule>> _rules() async {
    final local = await Services.repo.getLocalRules();
    return local.isNotEmpty ? local : DefaultAlertRules.all;
  }

  void unawaitedSync() {
    Services.sync.syncNow(); // fire-and-forget; safe offline
  }

  // ── Post-save panels ─────────────────────────────────────────────────────

  void _showAlertPanel(List<ClinicalAlert> fired) {
    final hasRed = fired.any((a) => a.level == AlertLevel.red);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          border: Border.all(
              color: hasRed ? AppTheme.red : AppTheme.amber, width: 2),
        ),
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(hasRed ? Icons.sos : Icons.warning_amber,
                size: 40, color: hasRed ? AppTheme.red : AppTheme.amber),
            const SizedBox(height: 10),
            Text(
              hasRed ? '🚨 ALERT' : '⚠ REVIEW NEEDED',
              style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: hasRed ? AppTheme.red : AppTheme.amber),
            ),
            const SizedBox(height: 8),
            for (final a in fired)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: RiskBadge(level: a.level),
              ),
            Text(
              fired.first.message +
                  ' (${fired.map((a) => a.ruleKey).join(', ')})',
              style: const TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 6),
            const Text(
              'The system does not diagnose. The next step is a clinical '
              'decision by the attending health worker.',
              style: TextStyle(fontSize: 12, color: AppTheme.muted),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                    child: FilledButton.icon(
                  icon: const Icon(Icons.medical_information),
                  label: const Text('ASSESS'),
                  onPressed: () async {
                    for (final a in fired) {
                      await Services.repo.setAlertStatus(
                          a.id, 'assessed', 'Clinically assessed at visit',
                          Services.auth.userId);
                    }
                    Navigator.of(ctx).pop();
                    _showNextAppointment();
                  },
                )),
                const SizedBox(width: 8),
                Expanded(
                    child: FilledButton.icon(
                  icon: const Icon(Icons.local_hospital),
                  label: const Text('REFER'),
                  style: FilledButton.styleFrom(
                      backgroundColor:
                          hasRed ? AppTheme.red : AppTheme.amber),
                  onPressed: () async {
                    for (final a in fired) {
                      await Services.repo.setAlertStatus(
                          a.id, 'referred',
                          'Referred from danger-sign alert', Services.auth.userId);
                    }
                    Navigator.of(ctx).pop();
                    await Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => AlertReferralScreen(
                            pregnancy: widget.pregnancy,
                            referralMode: true)));
                    _showNextAppointment();
                  },
                )),
              ],
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () async {
                final controller = TextEditingController();
                final action = await showDialog<String>(
                  context: context,
                  builder: (c2) => AlertDialog(
                    title: const Text('Document action'),
                    content: TextField(
                        controller: controller,
                        decoration: const InputDecoration(
                            labelText: 'Action taken / plan')),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.of(c2).pop(),
                          child: const Text('CANCEL')),
                      FilledButton(
                          onPressed: () =>
                              Navigator.of(c2).pop(controller.text),
                          child: const Text('SAVE')),
                    ],
                  ),
                );
                if (action != null && action.trim().isNotEmpty) {
                  for (final a in fired) {
                    await Services.repo.setAlertStatus(a.id, 'documented',
                        action.trim(), Services.auth.userId);
                  }
                }
                Navigator.of(ctx).pop();
                _showNextAppointment();
              },
              child: const Text('DOCUMENT ACTION'),
            ),
          ],
        ),
      ),
    );
  }

  void _showNextAppointment() {
    final (w, _) = GestationalMath.gaFromLmp(widget.pregnancy.lmpDate);
    final recommended =
        DateTime.now().add(GestationalMath.suggestedNextVisitGap(w));
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('NEXT APPOINTMENT',
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.1,
                      color: AppTheme.muted)),
              const SizedBox(height: 8),
              Text(
                  'Recommended date: ${fmtDate(recommended)}',
                  style:
                      const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text(
                'Reminder: 7 days before, 1 day before '
                '(SMS where an approved gateway is configured).',
                style: const TextStyle(fontSize: 12, color: AppTheme.muted),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                      child: OutlinedButton(
                          onPressed: () {
                            Navigator.of(ctx).pop();
                            _finish();
                          },
                          child: const Text('SCHEDULE LATER'))),
                  const SizedBox(width: 12),
                  Expanded(
                      child: FilledButton(
                          onPressed: () async {
                            final appt = Appointment(
                              id: _uuid.v4(),
                              pregnancyId: widget.pregnancy.id,
                              scheduledDate: recommended,
                              reminderDays: const [7, 1],
                              createdBy: Services.auth.userId,
                            );
                            await Services.repo.addAppointment(appt);
                            Navigator.of(ctx).pop();
                            _finish();
                          },
                          child: const Text('CONFIRM'))),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _finish() {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(
          builder: (_) => MotherProfileScreen(
              pregnancyId: widget.pregnancy.id)),
      (route) => route.settings.name == null,
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final (w, d) =
        GestationalMath.gaFromLmp(widget.pregnancy.lmpDate, _visitDate);
    return Scaffold(
      appBar: AppBar(title: const Text('New ANC Visit')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── A. Visit information ───────────────────────────────────────
          SectionCard(
            title: 'A. Visit information',
            child: Column(
              children: [
                InkWell(
                  onTap: () async {
                    final dt = await showDatePicker(
                        context: context,
                        initialDate: _visitDate,
                        firstDate: DateTime.now().subtract(
                            const Duration(days: 400)),
                        lastDate: DateTime.now()
                            .add(const Duration(days: 1)));
                    if (dt != null) setState(() => _visitDate = dt);
                  },
                  child: InputDecorator(
                    decoration: const InputDecoration(
                        labelText: 'Visit date',
                        suffixIcon: Icon(Icons.calendar_today)),
                    child: Text(fmtDate(_visitDate),
                        style:
                            const TextStyle(fontWeight: FontWeight.w600)),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(Icons.calculate, color: AppTheme.primary),
                    const SizedBox(width: 8),
                    Text(
                        'Gestational age: ${w} weeks $d days',
                        style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            color: AppTheme.primary)),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                    controller: _reason,
                    decoration:
                        const InputDecoration(labelText: 'Reason for visit')),
                const SizedBox(height: 12),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(
                        value: VisitType.routine, label: Text('Routine')),
                    ButtonSegment(value: VisitType.unscheduled,
                        label: Text('Unscheduled')),
                    ButtonSegment(value: VisitType.review,
                        label: Text('Review')),
                    ButtonSegment(value: VisitType.followUp,
                        label: Text('Follow-up')),
                  ],
                  selected: {_visitType},
                  onSelectionChanged: (s) =>
                      setState(() => _visitType = s.first),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // ── B. Maternal observations ──────────────────────────────────
          SectionCard(
            title: 'B. Maternal observations',
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                        child: TextField(
                            controller: _systolic,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                                labelText: 'BP systolic',
                                hintText: '120'))),
                    const SizedBox(width: 10),
                    Expanded(
                        child: TextField(
                            controller: _diastolic,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                                labelText: 'BP diastolic',
                                hintText: '80'))),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                        child: TextField(
                            controller: _pulse,
                            keyboardType: TextInputType.number,
                            decoration:
                                const InputDecoration(labelText: 'Pulse'))),
                    const SizedBox(width: 10),
                    Expanded(
                        child: TextField(
                            controller: _temp,
                            keyboardType:
                                const TextInputType.numberWithOptions(
                                    decimal: true),
                            decoration: const InputDecoration(
                                labelText: 'Temp (°C)', hintText: '36.8'))),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                        child: TextField(
                            controller: _rr,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                                labelText: 'Resp. rate'))),
                    const SizedBox(width: 10),
                    Expanded(
                        child: TextField(
                            controller: _weight,
                            keyboardType:
                                const TextInputType.numberWithOptions(
                                    decimal: true),
                            decoration:
                                const InputDecoration(labelText: 'Weight (kg)'))),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                    controller: _otherObs,
                    maxLines: 2,
                    decoration: const InputDecoration(
                        labelText:
                            'Other locally required observations')),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // ── C. Symptoms & danger signs ────────────────────────────────
          SectionCard(
            title: 'C. Symptoms and danger signs',
            trailing: const Text(
                'Large buttons — tap to report',
                style:
                    TextStyle(fontSize: 11, color: AppTheme.muted)),
            child: Column(
              children: [
                for (final entry in DangerSignKeys.ordered.entries)
                  DangerSignTile(
                    label: entry.value,
                    selected: _signs.contains(entry.key),
                    exclusive: entry.key == DangerSignKeys.noneReported,
                    onTap: () => _toggleSign(entry.key),
                  ),
                if (_signs.contains(DangerSignKeys.otherConcern))
                  Padding(
                    padding: const EdgeInsets.only(top: 8, left: 40),
                    child: TextField(
                      decoration: const InputDecoration(
                          labelText: 'Describe the other symptom'),
                      onSubmitted: (_) {},
                    ),
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
            label: const Text('SAVE VISIT & CHECK ALERTS'),
            onPressed: _busy ? null : _save,
          ),
          const SizedBox(height: 8),
          const Text(
            'Saving runs the configurable alert engine on this device — it '
            'works fully offline. The engine flags potential danger signs; it '
            'never diagnoses.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: AppTheme.muted),
          ),
        ],
      ),
    );
  }
}
