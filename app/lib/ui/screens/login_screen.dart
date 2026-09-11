import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../services/service_locator.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _obscure = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    final ok = await Services.auth.signIn(
        email: _email.text.trim(), password: _password.text);
    if (!mounted) return;
    setState(() => _busy = false);
    if (!ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign-in failed. Check email and password.')),
      );
    }
    // On success, app.dart's auth stream swaps the route to AppShell.
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.surface,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.favorite, size: 56, color: AppTheme.red),
                  const SizedBox(height: 12),
                  const Text('MAMA CARE',
                      style: TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 2)),
                  const SizedBox(height: 4),
                  Text(
                    Services.supabase.isConfigured
                        ? 'Sign in to your facility account'
                        : 'Backend not configured — set SUPABASE_URL and '
                            'SUPABASE_ANON_KEY (--dart-define) to enable login. '
                            'Local (offline) mode is available once configured.',
                    style: const TextStyle(color: AppTheme.muted),
                  ),
                  const SizedBox(height: 28),
                  TextField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                    decoration: const InputDecoration(
                        labelText: 'Email', prefixIcon: Icon(Icons.email_outlined)),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _password,
                    obscureText: _obscure,
                    onSubmitted: (_) => _submit(),
                    decoration: InputDecoration(
                        labelText: 'Password',
                        prefixIcon: const Icon(Icons.lock_outline),
                        suffixIcon: IconButton(
                            icon: Icon(_obscure
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined),
                            onPressed: () =>
                                setState(() => _obscure = !_obscure))),
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: _busy || !Services.supabase.isConfigured
                        ? null
                        : _submit,
                    child: _busy
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('SIGN IN'),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Secure login • role-based access • session times out '
                    'after 15 minutes of inactivity.',
                    style: TextStyle(
                        fontSize: 12, color: AppTheme.muted),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
