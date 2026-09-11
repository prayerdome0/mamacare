import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config/app_config.dart';

/// Wraps the Supabase client. When the app is built without
/// --dart-define credentials, [client] is null and the app runs in
/// local-only mode (everything still works offline; sync is disabled).
class SupabaseClientHolder {
  SupabaseClientHolder._(this._config);

  final AppConfig _config;
  SupabaseClient? _client;

  bool get isConfigured => _config.isSupabaseConfigured;

  SupabaseClient? get client => _client;

  /// Must be awaited once at startup before any network use.
  Future<void> initialize() async {
    if (!_config.isSupabaseConfigured) return;
    try {
      await Supabase.initialize(
        url: _config.supabaseUrl!,
        anonKey: _config.supabaseAnonKey!,
        authOptions: const FlutterAuthOptions(
          // No auto-refresh surprises in a clinical app: the session is
          // managed explicitly by AuthService (inactivity timeout included).
          autoRefreshToken: false,
        ),
      );
      _client = Supabase.instance.client;
    } catch (e) {
      debugPrint('Supabase init failed (offline mode): $e');
      _client = null;
    }
  }
}
