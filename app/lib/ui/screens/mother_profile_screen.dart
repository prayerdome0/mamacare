import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../models/anc_visit.dart';
import '../../models/mother.dart';
import '../../models/pregnancy.dart';
import '../../models/referral.dart';
import '../../services/clinical/gestational_math.dart';
import '../../services/service_locator.dart';
import '../widgets/shared.dart';
import 'alert_referral_screen.dart';
import 'new_anc_visit_screen.dart';
import 'pregnancy_details_screen.dart';

/// The mother profile — the core screen of the app.
///
///  ┌──────────────────────────┐
///  │ ← MARY PHIRI             │
///  │ ID: MC-000245            │
///  ├──────────────────────────┤
///  │ Pregnancy  24w 3d        │
///  │ EDD: 18 Mar 2027         │
///  ├──────────────────────────┤
///  │ RISK STATUS  🟠 REVIEW   │
///  ├──────────────────────────┤
///  │ [+ ANC VISIT]            │
///  │ [RECORD ALERT] [REFERRAL]│
///  ├──────────────────────────┤
///  │ ANC TIMELINE             │
///  ├──────────────────────────┤
///  │ Vitals | Tests | Notes   │
///  └──────────────────────────┘
class MotherProfileScreen extends StatefulWidget {
  const MotherProfileScreen({super.key, this.motherId, this.pregnancyId});

  final String? motherId;
  final String? pregnancyId;

  @override
  State<MotherProfileScreen> createState() => _MotherProfileScreenState();
}

class _MotherProfileScreenState extends State<MotherProfileScreen> {
  Mother? _mother;
  Pregnancy? _pregnancy;
  List<VisitRecord> _visits = [];
  List<String> _openAlerts = const []; // levels
  Referral? _activeReferral;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    Mother? mother;
    Pregnancy? pregnancy;
    if (widget.motherId != null) {
      mother = await Services.repo.getMother(widget.motherId!);
      final pregs = await Services.repo.getPregnancies(widget.motherId!);
      final active = pregs
          .where((p) => p.status == PregnancyStatus.active)
          .toList();
      pregnancy =
          active.isNotEmpty ? active.first : (pregs.isNotEmpty ? pregs.last : null);
    } else if (widget.pregnancyId != null) {
      pregnancy = await Services.repo.getPregnancy(widget.pregnancyId!);
      mother = pregnancy == null
          ? null
          : await Services.repo.getMother(pregnancy.motherId);
    }
    Referral? referral;
    if (pregnancy != null) {
      final visits = await Services.repo.getVisitRecords(pregnancy.id);
      _visits = visits;
      final alerts = await Services.repo.getPregnancyAlerts(pregnancy.id);
      _openAlerts =
          alerts.where((a) => a.status == 'open').map((a) => a.level).toList();
      referral = await Services.repo.getActiveReferral(pregnancy.id);
    }
    if (!mounted) return;
    setState(() {
      _mother = mother;
      _pregnancy = pregnancy;
      _activeReferral = referral;
      _loading = false;
    });
  }

  String get _riskLevel {
    if (_openAlerts.contains('red')) return 'red';
    if (_openAlerts.contains('amber')) return 'amber';
    return 'green';
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final mother = _mother;
    final pregnancy = _pregnancy;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(mother?.fullName ?? 'Unknown',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            Text(
              'ID: ${mother?.displayCode ?? '—'}  •  ${_syncLabel(mother?.id)}',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w400),
            ),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Pregnancy block ────────────────────────────────────────────
          if (pregnancy != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('PREGNANCY',
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.1,
                            color: AppTheme.muted)),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: _kv(
                              'Gestational age',
                              GestationalMath.gaLabel(pregnancy.lmpDate)),
                        ),
                        Expanded(
                          child: _kv('EDD', fmtDate(pregnancy.eddDate)),
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        Expanded(
                            child: _kv('Gravida / Para',
                                '${pregnancy.gravida} / ${pregnancy.para}')),
                        Expanded(
                            child: _kv(
                                'Status', PregnancyStatus.label(pregnancy.status))),
                      ],
                    ),
                    if (pregnancy.riskFactors.isNotEmpty)
                      Wrap(
                        spacing: 6,
                        children: [
                          for (final f in pregnancy.riskFactors)
                            Chip(
                                label: Text(f.replaceAll('_', ' '),
                                    style: const TextStyle(fontSize: 12))),
                        ],
                      ),
                  ],
                ),
              ),
            ),
          if (pregnancy != null) ...[
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    const Text('RISK STATUS',
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.1,
                            color: AppTheme.muted)),
                    const SizedBox(height: 10),
                    RiskBadge(
                        level: _riskLevel,
                        label: _riskLevel == 'red'
                            ? 'POTENTIAL DANGER SIGN'
                            : _riskLevel == 'amber'
                                ? 'REQUIRES REVIEW'
                                : 'NO ALERT'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            if (_activeReferral != null) ...[
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppTheme.red.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppTheme.red),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.sos, color: AppTheme.red),
                    const SizedBox(width: 12),
                    Expanded(
                        child: Text(
                            'Referral — ${ReferralStatus.label(_activeReferral!.status)}',
                            style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                color: AppTheme.red))),
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],
            // ── Actions ──────────────────────────────────────────────────
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    icon: const Icon(Icons.add),
                    label: const Text('ANC VISIT'),
                    onPressed: () async {
                      await Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) =>
                              NewAncVisitScreen(pregnancy: pregnancy)));
                      _load();
                    },
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.report_gerror_outline),
                    label: const Text('ALERT'),
                    onPressed: () async {
                      await Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) =>
                              AlertReferralScreen(pregnancy: pregnancy)));
                      _load();
                    },
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.local_hospital),
                    label: const Text('REFERRAL'),
                    onPressed: () async {
                      await Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => AlertReferralScreen(
                              pregnancy: pregnancy, referralMode: true)));
                      _load();
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            // ── ANC timeline ─────────────────────────────────────────────
            SectionCard(
              title: 'ANC Timeline',
              trailing: TextButton(
                  onPressed: () async {
                    await Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) =>
                            PregnancyDetailsScreen(pregnancy: pregnancy)));
                  },
                  child: const Text('Pregnancy details')),
              child: Column(
                children: [
                  _timelineItem(
                    Icons.badge,
                    'Registration',
                    fmtDate(mother?.createdAt),
                    Icons.check_circle,
                    AppTheme.green,
                  ),
                  for (final v in _visits)
                    _timelineItem(
                      Icons.local_hospital,
                      'ANC Visit ${v.visit.visitNumber}',
                      '${fmtDate(v.visit.visitDate)} • ${v.visit.gaLabel}',
                      v.dangerSigns.where((s) => s.reported).isNotEmpty
                          ? Icons.warning_amber
                          : Icons.check_circle,
                      v.dangerSigns.where((s) => s.reported).isNotEmpty
                          ? AppTheme.amber
                          : AppTheme.green,
                    ),
                  _timelineItem(
                    Icons.event,
                    'Next appointment',
                    pregnancy.eddDate.isBefore(DateTime.now())
                        ? 'Due for delivery'
                        : 'Scheduling…',
                    Icons.radio_button_unchecked,
                    AppTheme.muted,
                  ),
                ],
              ),
            ),
          ],
          // ── Vitals | Tests | Notes ─────────────────────────────────────
          const SizedBox(height: 16),
          DefaultTabController(
            length: 3,
            child: Card(
              child: Column(
                children: [
                  const TabBar(
                    tabs: [
                      Tab(text: 'Vitals'),
                      Tab(text: 'Tests'),
                      Tab(text: 'Notes'),
                    ],
                  ),
                  SizedBox(
                    height: 220,
                    child: TabBarView(
                      children: [
                        _vitalsTab(),
                        _testsTab(),
                        _notesTab(),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _vitalsTab() {
    if (_visits.isEmpty) {
      return const EmptyState(icon: Icons.monitor_heart, message: 'No vitals recorded yet.');
    }
    return ListView(
      padding: const EdgeInsets.all(8),
      children: [
        for (final v in _visits.reversed)
          if (v.vitals != null)
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Visit ${v.visit.visitNumber} • ${fmtDate(v.visit.visitDate)}',
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 13)),
                    const SizedBox(height: 6),
                    Text('BP ${v.vitals!.bpLabel}   •   '
                        'Pulse ${v.vitals!.pulse ?? '—'}   •   '
                        'Temp ${v.vitals!.temperatureC ?? '—'}°C   •   '
                        'RR ${v.vitals!.respiratoryRate ?? '—'}   •   '
                        'Weight ${v.vitals!.weightKg ?? '—'} kg',
                        style: const TextStyle(fontSize: 13)),
                  ],
                ),
              ),
            ),
      ],
    );
  }

  Widget _testsTab() {
    final all = _visits.expand((v) => v.tests).toList();
    if (all.isEmpty) {
      return const EmptyState(icon: Icons.science, message: 'No tests recorded yet.');
    }
    return ListView(
      padding: const EdgeInsets.all(8),
      children: [
        for (final t in all.reversed)
          ListTile(
            dense: true,
            title: Text(t.label, style: const TextStyle(fontSize: 13)),
            subtitle: const Text('', style: TextStyle(fontSize: 11)),
          ),
      ],
    );
  }

  Widget _notesTab() {
    final notes = _visits
        .where((v) =>
            (v.visit.reason != null && v.visit.reason!.isNotEmpty) ||
            (v.vitals?.otherObservations != null))
        .toList();
    if (notes.isEmpty) {
      return const EmptyState(icon: Icons.notes, message: 'No notes recorded yet.');
    }
    return ListView(
      padding: const EdgeInsets.all(8),
      children: [
        for (final v in notes.reversed)
          Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Visit ${v.visit.visitNumber} • ${fmtDate(v.visit.visitDate)}',
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 13)),
                  const SizedBox(height: 4),
                  if (v.visit.reason != null) Text('Reason: ${v.visit.reason}'),
                  if (v.vitals?.otherObservations != null)
                    Text('Observations: ${v.vitals!.otherObservations}'),
                  if (v.reportedSignsLabel.isNotEmpty)
                    Text('Reported: ${v.reportedSignsLabel}',
                        style: const TextStyle(color: AppTheme.red)),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _timelineItem(IconData icon, String title, String subtitle,
      IconData stateIcon, Color stateColor) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
                color: AppTheme.primary.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, size: 18, color: AppTheme.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 14)),
                Text(subtitle,
                    style: const TextStyle(
                        fontSize: 12, color: AppTheme.muted)),
              ],
            ),
          ),
          Icon(stateIcon, size: 20, color: stateColor),
        ],
      ),
    );
  }

  Widget _kv(String label, String value) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: const TextStyle(
                  fontSize: 12, color: AppTheme.muted)),
          const SizedBox(height: 2),
          Text(value,
              style:
                  const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
        ],
      );

  String _syncLabel(String? motherId) => '✓ saved locally';
}
