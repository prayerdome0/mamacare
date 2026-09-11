import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../config/app_config.dart';
import '../models/user_profile.dart';
import 'supabase_client.dart';

/// Supabase email/password auth with:
///  * role + facility profile loaded after sign-in
///  * 15-minute inactivity auto sign-out (session timeout)
///  * explicit sign-out + "sign out of all sessions" for lost devices.
class AuthService {
  AuthService(this.supabase);

  final SupabaseClientHolder supabase;
  final _controller = StreamController<bool>.broadcast();

  UserProfile? _profile;
  Timer? _idleTimer;
  bool _signedIn = false;

  /// Whether a worker is currently signed in.
  Stream<bool> get onAuthState => _controller.stream;

  UserProfile? get profile => _profile;
  bool get isSignedIn => _signedIn;

  String? get userId => _profile?.id;
  String? get facilityId => _profile?.facilityId;
  String? get facilityName => _profile?.facilityName;

  Future<bool> signIn({required String email, required String password}) async {
    final c = supabase.client;
    if (c == null) return false;
    try {
      await c.auth.signInWithPassword(email: email, password: password);
      await _loadProfile();
      return true;
    } on AuthException catch (_) {
      return false;
    }
  }

  Future<void> signOut() async {
    _idleTimer?.cancel();
    _signedIn = false;
    _profile = null;
    _controller.add(false);
    final c = supabase.client;
    if (c != null) {
      try {
        await c.auth.signOut();
      } catch (_) {/* offline sign-out still works locally */}
    }
  }

  /// Revokes every session for this user — use after a lost/stolen phone.
  Future<void> revokeAllSessions() async {
    final c = supabase.client;
    if (c != null) {
      try {
        await c.auth.signOut(scope: SignOutScope.global);
      } catch (_) {/* ignore */}
    }
  }

  /// Call from UI event handlers to reset the inactivity clock.
  void poke() {
    if (!_signedIn) return;
    _idleTimer?.cancel();
    _idleTimer = Timer(AppConfig.sessionTimeout, () {
      // Inactivity timeout — the spec requires a session timeout.
      signOut();
    });
  }

  Future<void> _loadProfile() async {
    final c = supabase.client;
    if (c == null) return;
    final session = c.auth.currentSession;
    if (session == null) return;

    final res = await c.from('profiles').select().eq('id', session.user.id).maybeSingle();
    final facilities = await c.from('facilities').select();

    if (res.data != null) {
      final facilityName = (facilities.data as List?)
              ?.map((f) => Map<String, dynamic>.from(f as Map))
              .where((f) => f['id'] == res.data['facility_id'])
              .firstOrNull?['name'] as String? ??
          null;
      _profile = UserProfile.fromMap(
          Map<String, dynamic>.from(res.data as Map),
          facilityName: facilityName);
      _signedIn = _profile!.isActive;
      poke();
    } else {
      // Profile row may still be materializing from the trigger.
      _profile = UserProfile(
        id: session.user.id,
        fullName: session.user.email ?? 'Health worker',
        role: Roles.chp, // least privilege until an admin assigns one
      );
      _signedIn = true;
      poke();
    }
    _controller.add(_signedIn);
  }

  /// Subscribe to Supabase session events (kept for future remote
  /// revocation handling; the local timeout is the primary control).
  void watchSession() {
    final c = supabase.client;
    if (c == null) return;
    c.auth.onAuthStateChange.listen((event) {
      if (event == AuthChangeEvent.signedOut) {
        _profile = null;
        _signedIn = false;
        _controller.add(false);
      }
    });
  }

  Future<void> dispose() async {
    _idleTimer?.cancel();
    await _controller.close();
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
