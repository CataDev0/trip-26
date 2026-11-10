// Constructors intentionally assign private dependencies to keep the
// internals of this notifier private.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';
import 'dart:collection';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:latlong2/latlong.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/constants.dart';
import '../services/trip_service.dart';
import '../services/visitor_service.dart';

/// Session-wide UI state that is not tied to trips or recording: the visitor
/// counter and the live-tracking position. Equivalent to V1's `appStore`.
class AppState extends ChangeNotifier {
  AppState({
    required VisitorService visitorService,
    required TripService tripService,
    required SharedPreferences prefs,
  }) : _visitorService = visitorService,
       _tripService = tripService,
       _prefs = prefs;

  static const _visitorIdKey = 'visitorId';

  final VisitorService _visitorService;
  final TripService _tripService;
  final SharedPreferences _prefs;

  int _visitorCount = 1;
  String? _visitorId;
  LatLng? _livePosition;
  final List<LatLng> _liveTrail = [];

  Timer? _visitorTimer;
  Timer? _liveTimer;
  bool _disposed = false;

  int get visitorCount => _visitorCount;
  LatLng? get livePosition => _livePosition;
  bool get isLiveTracking => _livePosition != null;
  UnmodifiableListView<LatLng> get liveTrail =>
      UnmodifiableListView(_liveTrail);

  Future<void> start() async {
    _visitorId = _prefs.getString(_visitorIdKey);
    if (_visitorId == null || _visitorId!.isEmpty) {
      final random = Random();
      _visitorId =
          '${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}'
          '${random.nextInt(1 << 32).toRadixString(36)}';
      await _prefs.setString(_visitorIdKey, _visitorId!);
    }

    unawaited(_refreshVisitorCount());
    _visitorTimer = Timer.periodic(
      visitorCountRefreshInterval,
      (_) => unawaited(_refreshVisitorCount()),
    );

    await refreshLiveTracking();
  }

  Future<void> _refreshVisitorCount() async {
    final visitorId = _visitorId;
    if (visitorId == null) return;
    try {
      final count = await _visitorService.fetchCount(visitorId);
      if (_disposed || count == _visitorCount) return;
      _visitorCount = count;
      notifyListeners();
    } catch (_) {
      // Visitor count is cosmetic — stay on the last known value.
    }
  }

  /// Poll `/api/live-tracking`; 404 simply means nobody is tracking.
  Future<void> refreshLiveTracking() async {
    LatLng? position;
    try {
      position = await _tripService.fetchLiveTracking();
    } catch (_) {
      position = null;
    }
    if (_disposed) return;

    _livePosition = position;
    if (position != null) {
      final last = _liveTrail.isEmpty ? null : _liveTrail.last;
      if (last == null ||
          last.latitude != position.latitude ||
          last.longitude != position.longitude) {
        _liveTrail.add(position);
      }
    }
    notifyListeners();
    _scheduleLiveRefresh();
  }

  void _scheduleLiveRefresh() {
    _liveTimer?.cancel();
    _liveTimer = Timer(
      isLiveTracking
          ? liveTrackingRefreshInterval
          : liveTrackingIdleRefreshInterval,
      () => unawaited(refreshLiveTracking()),
    );
  }

  @override
  void dispose() {
    _disposed = true;
    _visitorTimer?.cancel();
    _liveTimer?.cancel();
    super.dispose();
  }
}
