import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Stores the HTTP Basic credentials used by the V1 API.
///
/// Same model as V1: the username/password pair is base64-encoded and kept on
/// the device. The server validates it on every authenticated request.
class AuthService extends ChangeNotifier {
  AuthService(this._prefs);

  static const _tokenKey = 'auth_token';

  final SharedPreferences _prefs;

  String? _token;
  bool _loginRequested = false;

  String? get token => _token;

  bool get isLoggedIn => _token != null && _token!.isNotEmpty;

  /// True while the login modal should be visible.
  bool get loginRequested => _loginRequested;

  /// Reads the stored token synchronously (SharedPreferences is already loaded).
  void load() {
    _token = _prefs.getString(_tokenKey);
  }

  Future<void> saveCredentials(String username, String password) async {
    final token = base64Encode(utf8.encode('$username:$password'));
    _token = token;
    _loginRequested = false;
    await _prefs.setString(_tokenKey, token);
    notifyListeners();
  }

  Future<void> logout() async {
    _token = null;
    _loginRequested = false;
    await _prefs.remove(_tokenKey);
    notifyListeners();
  }

  /// Called by [ApiClient] on a 401 response.
  void requestLogin() {
    if (_loginRequested) return;
    _loginRequested = true;
    notifyListeners();
  }

  void cancelLogin() {
    if (!_loginRequested) return;
    _loginRequested = false;
    notifyListeners();
  }
}
