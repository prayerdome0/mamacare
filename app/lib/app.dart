import 'dart:async';

import 'package:flutter/material.dart';

import 'core/app_theme.dart';
import 'services/service_locator.dart';
import 'ui/app_shell.dart';
import 'ui/screens/splash_screen.dart';
import 'ui/screens/login_screen.dart';

/// Auth gate: splash → (configured ? login : offline notice + local mode).
class MamaCareApp extends StatefulWidget {
  const MamaCareApp({super.key});

  @override
  State<MamaCareApp> createState() => _MamaCareAppState();
}

class _MamaCareAppState extends State<MamaCareApp>
    with WidgetsBindingObserver {
  bool _booting = true;
  late final StreamSubscription _authSub =
      Services.auth.onAuthState.listen((_) {
    // Reset the inactivity clock whenever auth state changes.
    setState(() => _booting = false);
  });

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _booting = true;
    // Give the splash a beat to render, then gate on auth state.
    Future.delayed(const Duration(seconds: 1), () {
      if (mounted) setState(() => _booting = false);
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      Services.auth.poke(); // reset inactivity timer on foreground
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _authSub.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MAMA CARE',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: _root(),
    );
  }

  Widget _root() {
    if (_booting) return const SplashScreen();
    return Services.auth.isSignedIn
        ? const AppShell()
        : const LoginScreen();
  }
}
