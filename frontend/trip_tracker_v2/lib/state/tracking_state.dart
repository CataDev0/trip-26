// Constructors intentionally assign private dependencies to keep the
// internals of this notifier private.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/constants.dart';
import '../helpers/geo.dart';
import '../models/path_point.dart';
import '../models/travel_mode.dart';
import '../services/api_client.dart';
import '../services/tracking_service.dart';
import '../services/trip_service.dart';

/// Recording state and side effects. Port of V1 `helpers/gps.ts`:
/// save at most one point per 15 m, queue failed writes offline, and poll the
/// speed-limit proxy while moving.
class TrackingState extends ChangeNotifier {
  TrackingState({
    required TripService tripService,
    required TrackingService trackingService,
    required SharedPreferences prefs,
  }) : _tripService = tripService,
       _trackingService = trackingService,
       _prefs = prefs {
    _loadOfflineQueue();
    _loadTravelMode();
  }

  static const _offlineQueueKey = 'gps_offline_queue';
  static const _travelModeKey = 'travel_mode';

  final TripService _tripService;
  final TrackingService _trackingService;
  final SharedPreferences _prefs;

  bool _isTracking = false;
  bool _autoFollow = true;
  String _status = 'Not tracking';
  double? _currentSpeedKmh;
  int? _currentSpeedLimit;
  LatLng? _currentPosition;
  int? _currentTripId;
  PathPoint? _lastRecordedPoint;
  DateTime? _lastSpeedLimitFetch;
  TravelMode _travelMode = TravelMode.car;
  final List<LatLng> _breadcrumb = [];
  List<PathPoint> _offlineQueue = [];

  Timer? _acquireTimer;
  bool _flushing = false;

  bool get isTracking => _isTracking;
  bool get autoFollow => _autoFollow;
  String get status => _status;
  double? get currentSpeedKmh => _currentSpeedKmh;
  int? get currentSpeedLimit => _currentSpeedLimit;
  LatLng? get currentPosition => _currentPosition;
  int? get currentTripId => _currentTripId;
  int get queuedPointCount => _offlineQueue.length;
  bool get hasFix => _currentPosition != null;
  TravelMode get travelMode => _travelMode;
  List<LatLng> get breadcrumb => List.unmodifiable(_breadcrumb);

  bool get isOverSpeed =>
      _currentSpeedKmh != null &&
      _currentSpeedLimit != null &&
      _currentSpeedKmh! > _currentSpeedLimit!;

  Future<void> start() async {
    if (_isTracking) return;

    _currentTripId = DateTime.now().millisecondsSinceEpoch;
    _isTracking = true;
    _autoFollow = true;
    _status = 'Acquiring signal...';
    _currentSpeedKmh = null;
    _currentSpeedLimit = null;
    _currentPosition = null;
    _lastRecordedPoint = null;
    _lastSpeedLimitFetch = null;
    _breadcrumb.clear();
    notifyListeners();

    // Try to flush any old points at the start (V1 behaviour).
    unawaited(flushOfflineQueue());

    _acquireTimer = Timer(gpsAcquireTimeout, () {
      if (_isTracking && _currentPosition == null) {
        unawaited(
          _fail(
            'Timed out waiting for GPS. Check location permissions and that GPS is enabled.',
          ),
        );
      }
    });

    try {
      await _trackingService.start(
        mode: _travelMode,
        onPosition: _onPosition,
        onError: _onStreamError,
      );
    } catch (error) {
      _acquireTimer?.cancel();
      _acquireTimer = null;
      _isTracking = false;
      _status = 'GPS Error: ${_messageFor(error)}';
      notifyListeners();
    }
  }

  Future<void> stop() async {
    _acquireTimer?.cancel();
    _acquireTimer = null;
    await _trackingService.stop();

    _isTracking = false;
    _autoFollow = true;
    _currentSpeedKmh = null;
    _currentSpeedLimit = null;
    _currentPosition = null;
    _lastRecordedPoint = null;
    _status = 'GPS: Stopped';
    notifyListeners();
  }

  Future<void> toggleTracking() async {
    if (_isTracking) {
      await stop();
    } else {
      await start();
    }
  }

  void setAutoFollow(bool value) {
    if (_autoFollow == value) return;
    _autoFollow = value;
    notifyListeners();
  }

  void followCurrentLocation() {
    setAutoFollow(true);
  }

  void setTravelMode(TravelMode mode) {
    if (_travelMode == mode) return;
    _travelMode = mode;
    notifyListeners();
    unawaited(_prefs.setString(_travelModeKey, mode.name));
  }

  void _loadTravelMode() {
    _travelMode = TravelMode.fromStorage(_prefs.getString(_travelModeKey));
  }

  void _onPosition(Position position) {
    _acquireTimer?.cancel();
    _acquireTimer = null;

    _status = 'Tracking (${position.accuracy.toStringAsFixed(1)}m accuracy)';

    final rawSpeed = position.speed;
    final speedKmh = rawSpeed.isFinite && rawSpeed >= 0 ? rawSpeed * 3.6 : null;
    _currentSpeedKmh = speedKmh?.roundToDouble();
    _currentPosition = LatLng(position.latitude, position.longitude);
    notifyListeners();

    if (speedKmh != null &&
        speedKmh > speedLimitMinSpeedKmh &&
        _shouldRefreshSpeedLimit) {
      unawaited(_refreshSpeedLimit(position.latitude, position.longitude));
    }

    if (position.accuracy > trackingMaxAccuracyMeters) return;

    final point = PathPoint(
      lat: position.latitude,
      lng: position.longitude,
      timestamp: DateTime.now().toUtc().toIso8601String(),
      currentSpeed: _currentSpeedKmh,
      tripId: _currentTripId,
    );

    final last = _lastRecordedPoint;
    if (last != null &&
        haversineMeters(last.lat, last.lng, point.lat, point.lng) <
            trackingSaveDistanceMeters) {
      return;
    }

    _lastRecordedPoint = point;
    _breadcrumb.add(_currentPosition!);
    notifyListeners();
    unawaited(_savePoint(point));
  }

  void _onStreamError(Object error) {
    unawaited(_fail('GPS Error: ${_messageFor(error)}'));
  }

  Future<void> _fail(String message) async {
    _acquireTimer?.cancel();
    _acquireTimer = null;
    await _trackingService.stop();

    _isTracking = false;
    _autoFollow = true;
    _currentSpeedKmh = null;
    _currentSpeedLimit = null;
    _currentPosition = null;
    _lastRecordedPoint = null;
    _status = message;
    notifyListeners();
  }

  Future<void> _savePoint(PathPoint point) async {
    if (_offlineQueue.isNotEmpty) {
      _offlineQueue.add(point);
      _persistQueue();
      notifyListeners();
      await flushOfflineQueue();
      return;
    }

    try {
      final tripIds = await _tripService.savePathPoints([point]);
      _remapTripId(tripIds);
    } catch (_) {
      // Offline, server down, or not authenticated — keep the point locally.
      _offlineQueue.add(point);
      _persistQueue();
      notifyListeners();
    }
  }

  Future<void> flushOfflineQueue() async {
    if (_flushing || _offlineQueue.isEmpty) return;
    _flushing = true;

    final batch = List<PathPoint>.of(_offlineQueue);
    try {
      final tripIds = await _tripService.savePathPoints(batch);

      // New points may have been appended while the request was in flight;
      // remove only the batch that was actually saved.
      final removeCount = batch.length < _offlineQueue.length
          ? batch.length
          : _offlineQueue.length;
      _offlineQueue.removeRange(0, removeCount);
      _persistQueue();
      _remapTripId(tripIds);
      notifyListeners();
    } catch (_) {
      // Still offline — retain the queue and try again later.
    } finally {
      _flushing = false;
    }
  }

  /// The server may remap a client-generated trip id if it collides with an
  /// existing row — follow it so subsequent points stay in the same trip.
  void _remapTripId(Map<int, int> tripIds) {
    final current = _currentTripId;
    if (current == null) return;
    final remapped = tripIds[current];
    if (remapped == null || remapped == current) return;

    _currentTripId = remapped;
    _offlineQueue = [
      for (final point in _offlineQueue)
        if (point.tripId == current)
          point.copyWith(tripId: remapped)
        else
          point,
    ];
    _persistQueue();
    notifyListeners();
  }

  bool get _shouldRefreshSpeedLimit {
    final last = _lastSpeedLimitFetch;
    return last == null ||
        DateTime.now().difference(last) >= speedLimitRefreshInterval;
  }

  Future<void> _refreshSpeedLimit(double lat, double lng) async {
    _lastSpeedLimitFetch = DateTime.now();
    try {
      final limit = await _tripService.fetchSpeedLimit(lat, lng);
      _currentSpeedLimit = limit;
      notifyListeners();
    } catch (_) {
      // Speed limits are a "should have" feature — fail silently.
    }
  }

  void _loadOfflineQueue() {
    final raw = _prefs.getString(_offlineQueueKey);
    if (raw == null || raw.isEmpty) return;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return;
      _offlineQueue = [
        for (final item in decoded)
          if (item is Map<String, dynamic>) PathPoint.fromApiJson(item),
      ];
    } catch (_) {
      _offlineQueue = [];
    }
  }

  void _persistQueue() {
    unawaited(
      _prefs.setString(
        _offlineQueueKey,
        jsonEncode(_offlineQueue.map((point) => point.toApiJson()).toList()),
      ),
    );
  }

  String _messageFor(Object error) {
    if (error is TrackingException) return error.message;
    if (error is ApiException) return error.message;
    return error.toString();
  }

  @override
  void dispose() {
    _acquireTimer?.cancel();
    unawaited(_trackingService.stop());
    super.dispose();
  }
}
