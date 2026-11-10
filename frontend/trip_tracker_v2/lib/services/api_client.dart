import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'auth_service.dart';

class ApiException implements Exception {
  const ApiException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  @override
  String toString() => message;
}

/// Thin HTTP wrapper around the V1 backend.
///
/// Mirrors V1's `authFetch`: attaches the stored Basic auth header when
/// present, and asks [AuthService] to show the login modal on a 401.
class ApiClient {
  ApiClient({
    required String baseUrl,
    required this.auth,
    http.Client? httpClient,
  }) : _baseUrl = baseUrl.replaceAll(RegExp(r'/$'), ''),
       _http = httpClient ?? http.Client();

  final String _baseUrl;
  final AuthService auth;
  final http.Client _http;

  static const _timeout = Duration(seconds: 30);

  Map<String, String> get _headers => {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    if (auth.token != null) 'Authorization': 'Basic ${auth.token}',
  };

  Uri _uri(String path, Map<String, String>? query) {
    final uri = Uri.parse('$_baseUrl$path');
    if (query == null || query.isEmpty) return uri;
    return uri.replace(queryParameters: {...uri.queryParameters, ...query});
  }

  Future<dynamic> get(String path, {Map<String, String>? query}) {
    return _send('GET', path, query: query);
  }

  Future<dynamic> post(String path, {Object? body}) {
    return _send('POST', path, body: body);
  }

  Future<dynamic> put(String path, {Object? body}) {
    return _send('PUT', path, body: body);
  }

  Future<dynamic> delete(String path, {Object? body}) {
    return _send('DELETE', path, body: body);
  }

  Future<dynamic> _send(
    String method,
    String path, {
    Map<String, String>? query,
    Object? body,
  }) async {
    final request = http.Request(method, _uri(path, query))
      ..headers.addAll(_headers);
    if (body != null) {
      request.body = jsonEncode(body);
    }

    final http.Response response;
    try {
      final streamed = await _http.send(request).timeout(_timeout);
      response = await http.Response.fromStream(streamed);
    } on TimeoutException {
      throw const ApiException(0, 'Request timed out. Is the server running?');
    } on http.ClientException catch (error) {
      throw ApiException(0, 'Network error: ${error.message}');
    }

    if (response.statusCode == 401) {
      auth.requestLogin();
      throw const ApiException(
        401,
        'Authentication required. Please log in and try again.',
      );
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = _errorMessage(response);
      throw ApiException(
        response.statusCode,
        message == null || message.isEmpty
            ? 'Request failed (${response.statusCode})'
            : message,
      );
    }

    if (response.body.isEmpty) return null;
    try {
      return jsonDecode(response.body);
    } on FormatException {
      throw ApiException(response.statusCode, 'Invalid response from server');
    }
  }

  String? _errorMessage(http.Response response) {
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is Map && decoded['error'] is String) {
        return decoded['error'] as String;
      }
    } on FormatException {
      // Not JSON — fall back to the status line.
    }
    return response.reasonPhrase;
  }

  void dispose() {
    _http.close();
  }
}
