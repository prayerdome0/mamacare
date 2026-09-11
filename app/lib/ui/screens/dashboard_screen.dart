import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../services/service_locator.dart';
import '../widgets/shared.dart';
import 'alerts_screen.dart';
import 'appointments_screen.dart';
import 'mother_profile_screen.dart';

/// Home: the four priority tiles from the design spec, plus today's and
/// missed-visit lists.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Map<String, dynamic> _stats = {};
  List<Map<String, dynamic>> _today = [];
  List<Map<String, dynamic>> _missed = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final stats = await Services.repo.dashboardStats();
    final today = await Services.repo.getAppointments(includeOverdue: false);
    final missed = await Services.repo.getMissedAppointments();
    if (!mounted) return;
    setState(() {
      _stats = stats;
      _today = today;
      _missed = missed;
    });
    if (!Services.auth.isSignedIn) return;
    await Services.reminders.notifyTodaysAppointments(today.length);
    await Services.reminders.notifyMissedVisits(missed.length);
  }

  @override
  Widget build(BuildContext context) {
    final red = _stats['redAlerts'] as int? ?? 0;
    final amber = _stats['amberAlerts'] as int? ?? 0;
    final todayCount = _stats['todayAppointments'] as int? ?? 0;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              Expanded(
                child: StatCard(
                  icon: Icons.sos,
                  title: 'URGENT ALERTS',
                  value: '$red',
                  color: AppTheme.red,
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => const AlertsScreen(initialTab: 0))),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: StatCard(
                  icon: Icons.warning_amber,
                  title: 'REVIEW NEEDED',
                  value: '$amber',
                  color: AppTheme.amber,
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => const AlertsScreen(initialTab: 1))),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: StatCard(
                  icon: Icons.event_note,
                  title: "TODAY'S ANC",
                  value: '$todayCount',
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => const AppointmentsScreen())),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: StatCard(
                  icon: Icons.schedule,
                  title: 'MISSED VISITS',
                  value: '${_stats['missed'] ?? 0}',
                  color: AppTheme.amber,
                  onTap: () =>
                      Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => const AppointmentsScreen(
                              initialTab: 1))),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SectionCard(
            title: 'Today',
            child: _today.isEmpty
                ? const EmptyState(
                    icon: Icons.event_available,
                    message: 'No appointments scheduled for today.')
                : Column(
                    children: [
                      for (final a in _today.take(6))
                        _ApptRow(
                          name: a['mother_name'] as String? ?? '—',
                          code: a['mother_code'] as String? ??
                              a['provisional_code'] as String? ??
                              '',
                          date: a['scheduled_date'] as String? ?? '',
                          urgent: red > 0,
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                                builder: (_) => MotherProfileScreen(
                                    pregnancyId: a['pregnancy_id'] as String)),
                          ),
                        ),
                      if (_today.length > 6)
                        TextButton(
                          onPressed: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                  builder: (_) => const AppointmentsScreen())),
                          child: const Text('See all ${_today.length}'),
                        ),
                    ],
                  ),
          ),
          const SizedBox(height: 16),
          SectionCard(
            title: 'Missed visits — follow-up needed',
            child: _missed.isEmpty
                ? const EmptyState(
                    icon: Icons.verified,
                    message: 'No overdue visits. Well done.')
                : Column(
                    children: [
                      for (final m in _missed.take(5))
                        ListTile(
                          dense: true,
                          leading: CircleAvatar(
                              backgroundColor:
                                  AppTheme.red.withValues(alpha: 0.12),
                              child: const Icon(Icons.person,
                                  size: 20, color: AppTheme.red)),
                          title: Text(m['mother_name'] as String? ?? '—'),
                          subtitle: Text(
                              'Appointment ${_shortDate(m['scheduled_date'])} • '
                              '${m['days_overdue']} days overdue'),
                          trailing: FilledButton.tonal(
                              onPressed: () => Navigator.of(context).push(
                                    MaterialPageRoute(
                                        builder: (_) => AppointmentsScreen(
                                            initialTab: 1)),
                                  ),
                              child: const Text('FOLLOW-UP')),
                        ),
                      if (_missed.length > 5)
                        TextButton(
                            onPressed: () => Navigator.of(context).push(
                                MaterialPageRoute(
                                    builder: (_) =>
                                        const AppointmentsScreen(initialTab: 1))),
                            child: Text('See all ${_missed.length}')),
                    ],
                  ),
          ),
          const SizedBox(height: 16),
          Text(
            'Registered: ${_stats['totalMothers'] ?? 0} mothers • '
            'Active pregnancies: ${_stats['activePregnancies'] ?? 0} • '
            'Visits this month: ${_stats['visitsThisMonth'] ?? 0} • '
            'Active referrals: ${_stats['activeReferrals'] ?? 0}',
            style: const TextStyle(fontSize: 12, color: AppTheme.muted),
          ),
        ],
      ),
    );
  }

  String _shortDate(dynamic v) {
    final s = (v as String?) ?? '';
    return s.length >= 10 ? s.substring(5, 10) : s;
  }
}

class _ApptRow extends StatelessWidget {
  const _ApptRow({
    required this.name,
    required this.code,
    required this.date,
    required this.urgent,
    required this.onTap,
  });

  final String name;
  final String code;
  final String date;
  final bool urgent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      dense: true,
      onTap: onTap,
      leading: CircleAvatar(
          backgroundColor: urgent
              ? AppTheme.red.withValues(alpha: 0.12)
              : AppTheme.primary.withValues(alpha: 0.12),
          child: Icon(
              urgent ? Icons.sos : Icons.event,
              size: 18,
              color: urgent ? AppTheme.red : AppTheme.primary)),
      title: Text(name),
      subtitle: Text('$code • ${date.length >= 10 ? date.substring(5, 10) : date}'),
      trailing: const Icon(Icons.chevron_right, size: 18),
    );
  }
}
