import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../models/mother.dart';
import '../../services/service_locator.dart';
import '../widgets/shared.dart';

/// All open clinical alerts, tabbed RED (urgent) / AMBER (review).
class AlertsScreen extends StatefulWidget {
  const AlertsScreen({super.key, this.initialTab = 0});

  final int initialTab;

  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab =
      TabController(length: 2, vsync: this, initialIndex: widget.initialTab);
  List<Map<String, dynamic>> _alerts = [];
  bool _loading = true;

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
    final rows = await Services.repo.getOpenAlerts();
    if (!mounted) return;
    setState(() {
      _alerts = rows;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final redCount =
        _alerts.where((a) => a['level'] == 'red').length;
    final amberCount =
        _alerts.where((a) => a['level'] == 'amber').length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Alerts'),
        bottom: TabBar(
          controller: _tab,
          tabs: [
            Tab(text: 'URGENT ($redCount)'),
            Tab(text: 'REVIEW ($amberCount)'),
          ],
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tab,
              children: [
                _AlertList(level: 'red', onChanged: _load),
                _AlertList(level: 'amber', onChanged: _load),
              ],
            ),
    );
  }
}

class _AlertList extends StatefulWidget {
  const _AlertList({required this.level, required this.onChanged});

  final String level;
  final VoidCallback onChanged;

  @override
  State<_AlertList> createState() => _AlertListState();
}

class _AlertListState extends State<_AlertList> {
  List<Map<String, dynamic>> _rows = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final rows =
        await Services.repo.getOpenAlerts().where((a) => a['level'] == widget.level).toList();
    if (!mounted) return;
    setState(() {
      _rows = rows;
      _loading = false;
    });
  }

  Future<void> _resolve(Map<String, dynamic> a, String status,
      String action) async {
    await Services.repo.setAlertStatus(a['id'] as String, status, action,
        Services.auth.userId);
    widget.onChanged();
    _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_rows.isEmpty) {
      return EmptyState(
        icon: widget.level == 'red' ? Icons.verified : Icons.check_circle,
        message: widget.level == 'red'
            ? 'No urgent alerts. Keep it that way.'
            : 'No review items pending.',
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          for (final a in _rows)
            Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(widget.level == 'red'
                            ? Icons.sos
                            : Icons.warning_amber,
                            color: widget.level == 'red'
                                ? AppTheme.red
                                : AppTheme.amber),
                        const SizedBox(width: 8),
                        Expanded(
                            child: Text(a['mother_name'] as String? ?? '—',
                                style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700))),
                        Text(a['mother_code'] as String? ??
                            a['provisional_code'] as String? ??
                            ''),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(a['message'] as String? ?? '',
                        style: const TextStyle(fontSize: 14, height: 1.35)),
                    const SizedBox(height: 4),
                    Text('Rule: ${a['rule_key']} • '
                        '${fmtDateTime(mcDate(a['created_at']))}',
                        style: const TextStyle(
                            fontSize: 12, color: AppTheme.muted)),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                            child: FilledButton.tonal(
                                onPressed: () => _resolve(
                                    a, 'assessed', 'Assessed on alerts'),
                                child: const Text('ASSESS'))),
                        const SizedBox(width: 8),
                        Expanded(
                            child: FilledButton.tonal(
                                onPressed: () => _resolve(
                                    a, 'referred', 'Referred from alerts'),
                                child: const Text('REFER'))),
                        const SizedBox(width: 8),
                        Expanded(
                            child: OutlinedButton(
                                onPressed: () => _resolve(
                                    a, 'documented', 'Documented on alerts'),
                                child: const Text('DOCUMENT'))),
                      ],
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
