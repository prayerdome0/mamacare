import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../services/service_locator.dart';
import 'screens/dashboard_screen.dart';
import 'screens/search_mothers_screen.dart';
import 'screens/appointments_screen.dart';
import 'screens/alerts_screen.dart';
import 'screens/reports_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/register_mother_screen.dart';

/// Main navigation, per the design spec:
/// Home | Mothers | Appointments | Alerts | Reports | Settings
class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  static const _screens = [
    DashboardScreen(),
    SearchMothersScreen(),
    AppointmentsScreen(),
    AlertsScreen(),
    ReportsScreen(),
    SettingsScreen(),
  ];

  void _greet() {
    final h = DateTime.now().hour;
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('MAMA CARE',
                style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2)),
            Text(
              '${_greet()}, ${Services.auth.profile?.fullName ?? 'worker'}',
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w400),
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: IconButton(
              tooltip: 'Sync now',
              iconSize: 22,
              icon: const Icon(Icons.cloud_sync, color: Colors.white),
              onPressed: () async {
                final ok = await Services.sync.syncNow();
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(ok
                          ? 'All records synced.'
                          : 'Sync could not complete (offline or not configured).'),
                    ),
                  );
                }
              },
            ),
          ),
        ],
      ),
      body: IndexedStack(index: _index, children: _screens),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'register',
        onPressed: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const RegisterMotherScreen()),
        ),
        icon: const Icon(Icons.person_add_alt_1),
        label: const Text('REGISTER MOTHER'),
        backgroundColor: AppTheme.red,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.groups_outlined), label: 'Mothers'),
          NavigationDestination(icon: Icon(Icons.event_outlined), label: 'Appointments'),
          NavigationDestination(icon: Icon(Icons.notifications_outlined), label: 'Alerts'),
          NavigationDestination(icon: Icon(Icons.bar_chart_outlined), label: 'Reports'),
          NavigationDestination(icon: Icon(Icons.settings_outlined), label: 'Settings'),
        ],
      ),
    );
  }
}
