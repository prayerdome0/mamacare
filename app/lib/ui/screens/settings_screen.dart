import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../services/service_locator.dart';
import '../widgets/shared.dart';

/// Settings: account, role/facility, sync state, security, sign-out.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _syncingNow = false;
  int _pending = 0;
  StreamSubscription<String>? _sub;

  @override
  void initState() {
    super.initState();
    _load();
    _sub = Services.sync.onStatus.listen((s) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _pending = await Services.sync.pendingCount());
  }

  Future<void> _syncNow() async {
    setState(() => _syncingNow = true);
    final ok = await Services.sync.syncNow();
    if (!mounted) return;
    setState(() => _syncingNow = false);
    await _load();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(ok
            ? 'Sync complete — all pending records uploaded.'
            : 'Sync could not complete. Check connectivity or backend config.'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final profile = Services.auth.profile;
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Account ────────────────────────────────────────────────────
          SectionCard(
            title: 'Account',
            child: Column(
              children: [
                _row('Name', profile?.fullName ?? '—'),
                const Divider(),
                _row('Role', profile == null ? '—' : _roleLabel(profile.role)),
                const Divider(),
                _row('Facility', profile?.facilityName ?? 'Not assigned'),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // ── Sync ───────────────────────────────────────────────────────
          SectionCard(
            title: 'Offline & sync',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  Services.supabase.isConfigured
                      ? 'Backend: connected (Supabase)'
                      : 'Backend: NOT configured — running local-only. '
                          'Set SUPABASE_URL / SUPABASE_ANON_KEY via '
                          '--dart-define to enable sync.',
                  style: TextStyle(
                      fontSize: 13,
                      color: Services.supabase.isConfigured
                          ? AppTheme.green
                          : AppTheme.amber,
                      fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                _row('Pending records', '$_pending'),
                const Divider(),
                _row('Last sync',
                    Services.sync.lastSyncAt != null
                        ? fmtDateTime(Services.sync.lastSyncAt)
                        : 'Never'),
                const Divider(),
                _row('Last sync error',
                    Services.sync.lastSyncError.isNotEmpty
                        ? Services.sync.lastSyncError
                        : '—'),
                const SizedBox(height: 12),
                FilledButton.icon(
                  icon: _syncingNow
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.cloud_sync),
                  label: const Text('SYNC NOW'),
                  onPressed: _syncingNow ? null : _syncNow,
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // ── Security ───────────────────────────────────────────────────
          SectionCard(
            title: 'Security',
            child: Column(
              children: [
                ListTile(
                  dense: true,
                  leading: const Icon(Icons.lock_outline),
                  title: const Text('Session timeout'),
                  subtitle: const Text(
                      'Automatic sign-out after 15 minutes of inactivity.'),
                ),
                ListTile(
                  dense: true,
                  leading:
                      const Icon(Icons.vpn_key, color: AppTheme.red),
                  title: const Text('Sign out of all sessions'),
                  subtitle: const Text(
                      'Use immediately if this phone is lost or stolen.'),
                  trailing: FilledButton(
                    style: FilledButton.styleFrom(
                        backgroundColor: AppTheme.red,
                        minimumSize: const Size(0, 40)),
                    onPressed: () async {
                      await Services.auth.revokeAllSessions();
                      await Services.auth.signOut();
                    },
                    child: const Text('REVOKE'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // ── About / sign out ───────────────────────────────────────────
          SectionCard(
            title: 'Application',
            child: Column(
              children: [
                _row('Version', Services.config.appVersion),
                const Divider(),
                const Text(
                  'MAMA CARE v2 — offline-first maternal health for health '
                  'workers. Clinical alert rules must be validated by the '
                  'implementing health authority before point-of-care use.',
                  style: TextStyle(fontSize: 12, color: AppTheme.muted),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  icon: const Icon(Icons.logout),
                  label: const Text('SIGN OUT'),
                  style: OutlinedButton.styleFrom(foregroundColor: AppTheme.red),
                  onPressed: () => Services.auth.signOut(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _roleLabel(String role) => switch (role) {
        'admin' => 'Administrator',
        'midwife' => 'Midwife',
        'nurse' => 'Nurse',
        'chp' => 'Community Health Worker',
        'supervisor' => 'Facility Supervisor',
        'mother' => 'Mother',
        _ => role,
      };

  Widget _row(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
                width: 130,
                child: Text(k,
                    style: const TextStyle(color: AppTheme.muted))),
            Expanded(
                child: Text(v,
                    style:
                        const TextStyle(fontWeight: FontWeight.w600))),
          ],
        ),
      );
}
