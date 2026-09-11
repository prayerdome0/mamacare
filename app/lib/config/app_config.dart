/// Central configuration. Values come from `--dart-define` at build time —
/// nothing is hard-coded, so no credentials ever enter the repository.
class AppConfig {
  final String? supabaseUrl;
  final String? supabaseAnonKey;
  final String appVersion;

  const AppConfig({
    required this.supabaseUrl,
    required this.supabaseAnonKey,
    required this.appVersion,
  });

  factory AppConfig.fromEnvironment() {
    const env = String.fromEnvironment;
    final url = env('SUPABASE_URL');
    final anon = env('SUPABASE_ANON_KEY');
    return AppConfig(
      supabaseUrl: url.isEmpty ? null : url,
      supabaseAnonKey: anon.isEmpty ? null : anon,
      appVersion: const String.fromEnvironment('APP_VERSION', defaultValue: '2.0.0'),
    );
  }

  bool get isSupabaseConfigured =>
      supabaseUrl != null && supabaseAnonKey != null;

  /// Inactivity timeout for the session (spec: session timeout is mandatory).
  static const Duration sessionTimeout = Duration(minutes: 15);
}
