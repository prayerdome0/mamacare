import 'package:flutter/material.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'app.dart';
import 'config/app_config.dart';
import 'services/service_locator.dart';
import 'services/supabase_client.dart';
import 'services/auth_service.dart';
import 'services/local_db/database.dart';
import 'services/data_repository.dart';
import 'services/sync/sync_engine.dart';
import 'services/reminders/reminder_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 1) Configuration (from --dart-define; no secrets in the codebase)
  Services.config = AppConfig.fromEnvironment();

  // 2) Backend client (nullable → app still works fully offline)
  Services.supabase = SupabaseClientHolder(Services.config);
  await Services.supabase.initialize();

  // 3) Offline store (SQLite)
  Services.database = await LocalDatabase.open();

  // 4) Local-first repository + sync engine
  final syncEngine =
      SyncEngine(Services.database, const Connectivity())
        ..client = () => Services.supabase.client;
  Services.sync = syncEngine;
  Services.repo = DataRepository(Services.database, syncEngine);

  // 5) Auth (email/password + 15-minute inactivity timeout)
  Services.auth = AuthService(Services.supabase);
  Services.auth.watchSession();

  // 6) Local notifications for reminders / alerts
  Services.reminders =
      ReminderService(FlutterLocalNotificationsPlugin());
  await Services.reminders.initialize();

  runApp(MamaCareApp());
}
