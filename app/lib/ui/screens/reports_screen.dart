import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../services/service_locator.dart';
import '../widgets/shared.dart';

/// Facility-level basic reports (the "basic reports" of the MVP).
/// Detailed aggregate reporting with PII minimization lives on the
/// supervisor web dashboard.
class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  Map<String, dynamic> _stats = {};
  List<Map<String, dynamic>> _missed = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final stats = await Services.repo.dashboardStats();
    final missed = await Services.repo.getMissedAppointments();
    if (!mounted) return;
    setState(() {
      _stats = stats;
      _missed = missed;
    });
  }

  @override
  Widget build(BuildContext context) {
    final red = _stats['redAlerts'] as int? ?? 0;
    final amber = _stats['amberAlerts'] as int? ?? 0;
    final totalAlerts = red + amber;
    final none = (_stats['activePregnancies'] as int? ?? 0) - totalAlerts;

    return Scaffold(
      appBar: AppBar(title: const Text('Reports')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            SectionCard(
              title: 'Pregnancies',
              child: Column(
                children: [
                  _row('Registered mothers',
                      '${_stats['totalMothers'] ?? 0}'),
                  const Divider(),
                  _row('Active pregnancies',
                      '${_stats['activePregnancies'] ?? 0}'),
                  const Divider(),
                  _row('ANC visits this month',
                      '${_stats['visitsThisMonth'] ?? 0}'),
                ],
              ),
            ),
            const SizedBox(height: 12),
            SectionCard(
              title: 'Alerts (open)',
              child: Column(
                children: [
                  _rowColored('🔴 Urgent (RED)', '$red', AppTheme.red),
                  const Divider(),
                  _rowColored('🟠 Review (AMBER)', '$amber', AppTheme.amber),
                  const Divider(),
                  _rowColored('🟢 No alert', '$none', AppTheme.green),
                ],
              ),
            ),
            const SizedBox(height: 12),
            SectionCard(
              title: 'Appointments & referrals',
              child: Column(
                children: [
                  _row('Scheduled today',
                      '${_stats['todayAppointments'] ?? 0}'),
                  const Divider(),
                  _row('Missed / overdue', '${_stats['missed'] ?? 0}'),
                  const Divider(),
                  _row('Active referrals',
                      '${_stats['activeReferrals'] ?? 0}'),
                ],
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Aggregate, facility-level figures only — no patient '
              'identifiers. Full cross-facility analytics are on the '
              'supervisor web dashboard.',
              style: TextStyle(fontSize: 12, color: AppTheme.muted),
            ),
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value) =>
      _rowColored(label, value, AppTheme.ink);

  Widget _rowColored(String label, String value, Color color) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label),
            Text(value,
                style: TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w800, color: color)),
          ],
        ),
      );
}
