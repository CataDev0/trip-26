import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import '../models/travel_mode.dart';

class TrackingException implements Exception {
  const TrackingException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Owns the platform location stream.
///
/// Android runs a foreground service notification and iOS is configured for
/// background updates in Info.plist. NOTE: geolocator's foreground service
/// keeps the app process alive while backgrounded, but does not survive the
/// OS killing the activity — full "process killed" tracking will need a
/// dedicated background service plugin (see README).
class TrackingService {
  StreamSubscription<Position>? _subscription;

  bool get isListening => _subscription != null;

  Future<void> start({
    TravelMode mode = TravelMode.car,
    required void Function(Position position) onPosition,
    required void Function(Object error) onError,
  }) async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const TrackingException(
        'Location services are disabled. Turn on GPS and try again.',
      );
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied) {
      throw const TrackingException('Location permission denied.');
    }
    if (permission == LocationPermission.deniedForever) {
      throw const TrackingException(
        'Location permission is permanently denied. Enable it in system settings.',
      );
    }

    await stop();
    _subscription = Geolocator.getPositionStream(
      locationSettings: _settings(mode),
    ).listen(onPosition, onError: onError);
  }

  LocationSettings _settings(TravelMode mode) {
    if (defaultTargetPlatform == TargetPlatform.android) {
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 0,
        intervalDuration: const Duration(seconds: 1),
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: 'Trip Tracker is recording',
          notificationText: 'Your trip continues in the background',
          notificationChannelName: 'Trip recording',
          enableWakeLock: true,
          setOngoing: true,
        ),
      );
    }

    if (defaultTargetPlatform == TargetPlatform.iOS) {
      return AppleSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        activityType: mode == TravelMode.car
            ? ActivityType.automotiveNavigation
            : ActivityType.fitness,
        distanceFilter: 0,
        allowBackgroundLocationUpdates: true,
        showBackgroundLocationIndicator: true,
        pauseLocationUpdatesAutomatically: false,
      );
    }

    return const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 0,
    );
  }

  Future<void> stop() async {
    await _subscription?.cancel();
    _subscription = null;
  }
}
