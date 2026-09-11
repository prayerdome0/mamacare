import '../config/app_config.dart';
import 'auth_service.dart';
import 'supabase_client.dart';
import 'local_db/database.dart';
import 'data_repository.dart';
import 'sync/sync_engine.dart';
import 'reminders/reminder_service.dart';

/// Tiny service locator. The app has a handful of long-lived services;
/// main() wires them once and screens read them via `Services.x`.
class Services {
  Services._();

  static late final AppConfig config;
  static late final SupabaseClientHolder supabase;
  static late final AuthService auth;
  static late final LocalDatabase database;
  static late final DataRepository repo;
  static late final SyncEngine sync;
  static late final ReminderService reminders;
}
