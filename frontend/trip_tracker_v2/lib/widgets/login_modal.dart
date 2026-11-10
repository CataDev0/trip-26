import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme.dart';
import '../services/auth_service.dart';
import '../state/app_state.dart';
import '../state/trip_state.dart';

/// Port of V1 `components/LoginModal.svelte`.
///
/// Displayed by the app-level overlay whenever [AuthService.loginRequested]
/// becomes true (for example after a 401 from the API).
class LoginModal extends StatefulWidget {
  const LoginModal({super.key});

  @override
  State<LoginModal> createState() => _LoginModalState();
}

class _LoginModalState extends State<LoginModal> {
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();

  String? _error;
  bool _saving = false;

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final username = _usernameController.text.trim();
    final password = _passwordController.text;
    if (username.isEmpty || password.isEmpty) {
      setState(() => _error = 'Please enter both fields.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await context.read<AuthService>().saveCredentials(username, password);
      if (!mounted) return;
      // Refresh the dataset: authenticated responses also include hidden trips.
      unawaited(context.read<TripState>().loadAll());
      unawaited(context.read<AppState>().refreshLiveTracking());
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = 'Could not save credentials: $error');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black.withValues(alpha: 0.5),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 320),
          child: Material(
            color: Colors.white,
            elevation: 8,
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Secure Login',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: kDarkText,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Authentication required',
                    style: TextStyle(fontSize: 13, color: kMutedText),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      _error!,
                      style: const TextStyle(color: kDangerRed, fontSize: 12.8),
                    ),
                  ],
                  const SizedBox(height: 14),
                  TextField(
                    controller: _usernameController,
                    textInputAction: TextInputAction.next,
                    decoration: _inputDecoration('Username'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _passwordController,
                    obscureText: true,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _login(),
                    decoration: _inputDecoration('Password'),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton(
                        onPressed: _saving
                            ? null
                            : () => context.read<AuthService>().cancelLogin(),
                        style: TextButton.styleFrom(
                          backgroundColor: const Color(0xFFCCCCCC),
                          foregroundColor: Colors.black,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(6),
                          ),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 15,
                            vertical: 10,
                          ),
                        ),
                        child: const Text('Cancel'),
                      ),
                      const SizedBox(width: 10),
                      FilledButton(
                        onPressed: _saving ? null : _login,
                        style: FilledButton.styleFrom(
                          backgroundColor: kPrimaryBlue,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(6),
                          ),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 15,
                            vertical: 10,
                          ),
                        ),
                        child: _saving
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Text('Save on Device'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  InputDecoration _inputDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      isDense: true,
      contentPadding: const EdgeInsets.all(10),
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: const BorderSide(color: Color(0xFFCCCCCC)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: const BorderSide(color: Color(0xFFCCCCCC)),
      ),
    );
  }
}
