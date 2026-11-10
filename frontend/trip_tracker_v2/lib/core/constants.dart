import 'package:flutter/foundation.dart';

/// Base URL for the Trip Tracker backend.
///
/// Override at build/run time:
///   flutter run --dart-define=API_BASE=http://192.168.1.20:3000
///
/// Defaults:
///   - Android emulator: http://10.0.2.2:3000 (host machine loopback)
///   - Everything else:  http://localhost:3000
const String _envApiBase = String.fromEnvironment('API_BASE');

String get apiBaseUrl {
  if (_envApiBase.isNotEmpty) return _envApiBase;
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
    return 'http://10.0.2.2:3000';
  }
  return 'http://localhost:3000';
}

const String appTitle = 'Trip Tracker';
const String appVersion = 'V2';
const String appIdentifier = 'com.triptrackerv2.app';

/// Sidebar behaviour
const double sidebarWidth = 480.0;
const double mobileBreakpoint = 768.0;

/// Map behaviour
const double minAttractionsZoom = 13;
const int maxSegmentsPerTrip = 400;

/// Tracking behaviour
const double trackingSaveDistanceMeters = 15;
const double trackingMaxAccuracyMeters = 20;
const Duration gpsAcquireTimeout = Duration(seconds: 30);
const Duration speedLimitRefreshInterval = Duration(seconds: 15);
const double speedLimitMinSpeedKmh = 10;

/// Polling
const Duration visitorCountRefreshInterval = Duration(minutes: 1);
const Duration liveTrackingRefreshInterval = Duration(seconds: 10);
const Duration liveTrackingIdleRefreshInterval = Duration(seconds: 60);
