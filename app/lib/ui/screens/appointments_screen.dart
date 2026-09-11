import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../../core/app_theme.dart';
import '../../models/follow_up.dart';
import '../../services/service_locator.dart';
import '../widgets/shared.dart';
import 'mother_profile_screen.dart';

/// Appointments dashboard + missed-visit management.
///
/// TAB 1 — TODAY:  "12 appointments • 🔴 2 urgent • 🟠 4 overdue • 🟢 6 routine"
/// TAB 2 — MISSED: auto-identified overdue mothers with follow-up recording
///                 (phone contacted / home visit / attended elsewhere / …).
class AppointmentsScreen extends StatefulWidget {
  const AppointmentsScreen({super.key, this.initialTab = 0});

  final int initialTab;

  @override
  State<AppointmentsScreen> createState() => _AppointmentsScreenState();
}

class _AppointmentsScreenState extends State<AppointmentsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab =
      TabController(length: 2, vsync: this, initialIndex: widget.initialTab);
  List<Map<String, dynamic>> _today = [];
  List<Map<String, dynamic>> _missed = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final today = await Services.repo.getAppointments();
    final missed = await Services.repo.getMissedAppointments();
    if (!mounted) return;
    setState(() {
      _today = today;
      _missed = missed;
    });
  }

  Future<void> _markAttended(Map<String, dynamic> row) async {
    await Services.repo.setAppointmentStatus(row['id'] as String, 'completed');
    _load();
  }

  Future<void> _recordFollowUp(Map<String, dynamic> row) async {
    final controller = TextEditingController();
    bool phone = false, home = false, elsewhere = false, unavailable = false,
        phoneUnavail = false, other = false;

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialog) => AlertDialog(
          title: const Text('Follow-up'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(row['mother_name'] as String? ?? ''),
                const SizedBox(height: 12),
                CheckboxListTile(
                    dense: true,
                    title: const Text('Phone contacted'),
                    value: phone,
                    onChanged: (v) =>
                        setDialog(() => phone = v ?? false)),
                CheckboxListTile(
                    dense: true,
                    title: const Text('Home visit'),
                    value: home,
                    onChanged: (v) => setDialog(() => home = v ?? false)),
                CheckboxListTile(
                    dense: true,
                    title: const Text('Mother attended elsewhere'),
                    value: elsewhere,
                    onChanged: (v) =>
                        setDialog(() => elsewhere = v ?? false)),
                CheckboxListTile(
                    dense: true,
                    title: const Text('Mother unavailable'),
                    value: unavailable,
                    onChanged: (v) =>
                        setDialog(() => unavailable = v ?? false)),
                CheckboxListTile(
                    dense: true,
                    title: const Text('Phone unavailable'),
                    value: phoneUnavail,
                    onChanged: (v) =>
                        setDialog(() => phoneUnavail = v ?? false)),
                CheckboxListTile(
                    dense: true,
                    title: const Text('Other'),
                    value: other,
                    onChanged: (v) => setDialog(() => other = v ?? false)),
                TextField(
                    controller: controller,
                    maxLines: 2,
                    decoration:
                        const InputDecoration(labelText: 'Outcome')),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('CANCEL')),
            FilledButton(
                onPressed: () async {
                  final f = FollowUp(
                    id: const Uuid().v4(),
                    pregnancyId: row['pregnancy_id'] as String,
                    appointmentId: row['id'] as String,
                    phoneContacted: phone,
                    homeVisit: home,
                    attendedElsewhere: elsewhere,
                    motherUnavailable: unavailable,
                    phoneUnavailable: phoneUnavail,
                    other: other,
                    outcome: controller.text.trim().isNotEmpty
                        ? controller.text.trim()
                        : null,
                    recordedBy: Services.auth.userId,
                  );
                  await Services.repo.addFollowUp(f);
                  // "CLOSE" — mark the appointment handled.
                  await Services.repo.setAppointmentStatus(
                      row['id'] as String,
                      elsewhere ? 'completed' : 'missed');
                  Navigator.of(ctx).pop();
                  _load();
                },
                child: const Text('SAVE FOLLOW-UP')),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Appointments'),
        bottom: TabBar(
          controller: _tab,
          tabs: [
            const Tab(text: 'TODAY'),
            Tab(text: 'MISSED (${_missed.length})'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tab,
        children: [
          RefreshIndicator(
            onRefresh: _load,
            child: _today.isEmpty
                ? const EmptyState(
                    icon: Icons.event_available,
                    message: 'No appointments scheduled for today.')
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(
                          '${_today.length} appointment${_today.length == 1 ? '' : 's'}',
                          style: const TextStyle(
                              fontSize: 14, color: AppTheme.muted),
                        ),
                      ),
                      for (final a in _today)
                        Card(
                          margin: const EdgeInsets.only(bottom: 10),
                          child: ListTile(
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                  builder: (_) => MotherProfileScreen(
                                      pregnancyId:
                                          a['pregnancy_id'] as String)),
                            ),
                            leading: const Icon(Icons.event_note,
                                color: AppTheme.primary),
                            title: Text(a['mother_name'] as String? ?? '—',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600)),
                            subtitle: Text(
                                '${a['mother_code'] ?? a['provisional_code'] ?? ''} • ${_short(a['scheduled_date'])}'),
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                SyncIcon(status: 'synced'),
                                IconButton(
                                    tooltip: 'Mark attended',
                                    icon: const Icon(Icons.check_circle,
                                        color: AppTheme.green),
                                    onPressed: () => _markAttended(a)),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
          ),
          RefreshIndicator(
            onRefresh: _load,
            child: _missed.isEmpty
                ? const EmptyState(
                    icon: Icons.verified,
                    message: 'No overdue visits. Well done.')
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      for (final m in _missed)
                        Card(
                          margin: const EdgeInsets.only(bottom: 12),
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Icon(_days(m) > 3
                                        ? Icons.sos
                                        : Icons.warning_amber,
                                        color: _days(m) > 3
                                            ? AppTheme.red
                                            : AppTheme.amber),
                                    const SizedBox(width: 8),
                                    Expanded(
                                        child: Text(
                                            m['mother_name'] as String? ?? '—',
                                            style: const TextStyle(
                                                fontSize: 16,
                                                fontWeight:
                                                    FontWeight.w700))),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(
                                    'Appointment: ${_short(m['scheduled_date'])} • '
                                    '${m['days_overdue']} days overdue • '
                                    '${m['mother_code'] ?? ''}',
                                    style: const TextStyle(
                                        fontSize: 13,
                                        color: AppTheme.muted)),
                                const SizedBox(height: 10),
                                Row(
                                  children: [
                                    Expanded(
                                        child: FilledButton.tonal(
                                            onPressed: () async {
                                              final phone =
                                                  m['phone'] as String?;
                                              if (phone == null ||
                                                  phone.isEmpty) {
                                                _snack('No phone on record.');
                                                return;
                                              }
                                              // Dialer intent is wired in
                                              // the full build via url_launcher;
                                              // the follow-up below covers it.
                                              await _recordFollowUp(m);
                                            },
                                            child:
                                                const Text('CONTACT'))),
                                    const SizedBox(width: 8),
                                    Expanded(
                                        child: FilledButton.tonal(
                                            onPressed: () =>
                                                _recordFollowUp(m),
                                            child: const Text('FOLLOW-UP'))),
                                    const SizedBox(width: 8),
                                    Expanded(
                                        child: OutlinedButton(
                                            onPressed: () async {
                                              await Services.repo
                                                  .setAppointmentStatus(
                                                      m['id'] as String,
                                                      'missed');
                                              _load();
                                            },
                                            child: const Text('CLOSE'))),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  int _days(Map<String, dynamic> m) =>
      ((m['days_overdue'] as num?) ?? 0).toInt();

  String _short(dynamic v) {
    final s = (v as String?) ?? '';
    return s.length >= 10 ? s.substring(5, 10) : s;
  }

  void _snack(String msg) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
}
