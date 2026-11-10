import 'dart:async';

import 'package:flutter/material.dart' hide NavigationBar;
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../core/constants.dart';
import '../core/theme.dart';
import '../helpers/date_formatters.dart';
import '../helpers/geo.dart';
import '../models/saved_location.dart';
import '../services/auth_service.dart';
import '../state/app_state.dart';
import '../state/tracking_state.dart';
import '../state/trip_state.dart';
import '../widgets/app_button.dart';
import '../widgets/navigation_bar.dart';
import '../widgets/side_bar.dart';
import '../widgets/speedometer.dart';
import '../widgets/travel_mode_selector.dart';
import '../widgets/trip_map.dart';

/// Port of V1 `Suite.svelte` — the tracking view.
///
/// Unlike V1, leaving this screen does not stop an active recording; tracking
/// is app-level state so background mode can keep collecting points. Use the
/// Stop Tracking button to end a trip.
class SuiteScreen extends StatefulWidget {
  const SuiteScreen({super.key});

  @override
  State<SuiteScreen> createState() => _SuiteScreenState();
}

class _SuiteScreenState extends State<SuiteScreen> {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  final _mapController = MapController();

  late final TrackingState _tracking;

  bool _sidebarExpanded = false;
  bool _mapReady = false;
  LatLng? _lastFollowed;

  @override
  void initState() {
    super.initState();
    _tracking = context.read<TrackingState>();
    _tracking.addListener(_onTrackingChanged);

    unawaited(context.read<TripState>().loadAll());

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final auth = context.read<AuthService>();
      if (!auth.isLoggedIn) auth.requestLogin();
    });
  }

  @override
  void dispose() {
    _tracking.removeListener(_onTrackingChanged);
    _mapController.dispose();
    super.dispose();
  }

  void _onTrackingChanged() {
    if (!mounted) return;

    final position = _tracking.currentPosition;
    if (_mapReady &&
        _tracking.isTracking &&
        _tracking.autoFollow &&
        position != null) {
      final last = _lastFollowed;
      if (last == null ||
          last.latitude != position.latitude ||
          last.longitude != position.longitude) {
        _lastFollowed = position;
        _mapController.move(position, 15);
      }
    }

    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final tripState = context.watch<TripState>();
    final appState = context.watch<AppState>();
    final tracking = context.watch<TrackingState>();

    return LayoutBuilder(
      builder: (context, constraints) {
        final isMobile = constraints.maxWidth < mobileBreakpoint;
        final sidebar = SideBar(
          onShowTrips: (ids) => _showTrips(tripState, ids),
          onRouteGuidance: _routeGuidance,
          onClose: () => _closeSidebar(isMobile),
        );

        return Scaffold(
          key: _scaffoldKey,
          drawer: isMobile
              ? Drawer(
                  width: constraints.maxWidth * 0.85,
                  child: SafeArea(child: sidebar),
                )
              : null,
          body: SafeArea(
            bottom: false,
            child: Column(
              children: [
                Expanded(
                  child: isMobile
                      ? _mapArea(tripState, appState, tracking)
                      : Row(
                          children: [
                            if (_sidebarExpanded)
                              SizedBox(width: sidebarWidth, child: sidebar),
                            Expanded(
                              child: _mapArea(tripState, appState, tracking),
                            ),
                          ],
                        ),
                ),
                NavigationBar(
                  showSidebarToggle: true,
                  statusText: tracking.status,
                  onToggleSidebar: () => _toggleSidebar(isMobile),
                  actions: [
                    TravelModeSelector(
                      mode: tracking.travelMode,
                      enabled: !tracking.isTracking,
                      onChanged: tracking.setTravelMode,
                    ),
                    AppButton(
                      label: tracking.isTracking
                          ? 'Stop Tracking'
                          : 'Start Tracking',
                      icon: tracking.isTracking ? Icons.stop : Icons.play_arrow,
                      color: tracking.isTracking ? kDangerRed : kPrimaryBlue,
                      onPressed: _toggleTracking,
                    ),
                    AppButton(
                      label: 'Leave',
                      icon: Icons.logout,
                      color: kWarningYellow,
                      textColor: Colors.black,
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _mapArea(
    TripState tripState,
    AppState appState,
    TrackingState tracking,
  ) {
    return Stack(
      children: [
        Positioned.fill(
          child: TripMap(
            controller: _mapController,
            initialCenter: _initialCenter(tripState, tracking),
            initialZoom: tracking.currentPosition != null ? 15 : 9,
            pathPoints: tripState.gpsPath,
            highlightedTripIds: tripState.highlightedTripIds,
            locations: tripState.locations,
            visitedIds: tripState.visitedIds,
            currentPosition: tracking.currentPosition,
            trackingTrail: tracking.breadcrumb,
            showCurrentPosition: tracking.isTracking,
            livePosition: appState.livePosition,
            liveTrail: appState.liveTrail,
            onLocationTap: (location) =>
                _showLocationDetails(tripState, location),
            onMapGesture: _onMapGesture,
            onMapReady: _onMapReady,
          ),
        ),
        if (tracking.isTracking) ...[
          Positioned(
            left: 20,
            bottom: 30,
            child: Speedometer(
              speedKmh: tracking.currentSpeedKmh,
              speedLimit: tracking.currentSpeedLimit,
              overSpeed: tracking.isOverSpeed,
            ),
          ),
          Positioned(
            right: 20,
            bottom: 38,
            child: AppButton(
              label: tracking.autoFollow ? 'Following' : 'Go to Current Pos',
              icon: tracking.autoFollow ? Icons.gps_fixed : Icons.navigation,
              color: tracking.autoFollow
                  ? const Color(0xFFE6F7FF)
                  : Colors.white,
              textColor: tracking.autoFollow ? kPrimaryBlueDark : kDarkText,
              onPressed: _centerOnCurrent,
            ),
          ),
        ],
      ],
    );
  }

  void _toggleSidebar(bool isMobile) {
    if (isMobile) {
      _scaffoldKey.currentState?.openDrawer();
    } else {
      setState(() => _sidebarExpanded = !_sidebarExpanded);
    }
  }

  void _closeSidebar(bool isMobile) {
    if (isMobile) {
      _scaffoldKey.currentState?.closeDrawer();
    } else {
      setState(() => _sidebarExpanded = false);
    }
  }

  Future<void> _toggleTracking() async {
    final tripState = context.read<TripState>();
    final wasTracking = _tracking.isTracking;
    await _tracking.toggleTracking();
    if (!mounted) return;

    if (wasTracking) {
      unawaited(tripState.loadMapData());
    } else if (_tracking.status.startsWith('GPS Error') ||
        _tracking.status.startsWith('Timed out')) {
      _showSnack(_tracking.status);
    }
  }

  void _onMapReady() {
    _mapReady = true;
    final position = _tracking.currentPosition;
    if (position != null && _tracking.autoFollow) {
      _lastFollowed = position;
      _mapController.move(position, 15);
    }
  }

  void _onMapGesture() {
    if (_tracking.isTracking) {
      _tracking.setAutoFollow(false);
    }
  }

  void _centerOnCurrent() {
    final position = _tracking.currentPosition;
    if (position == null) {
      _showSnack('No GPS position available yet.');
      return;
    }

    _tracking.followCurrentLocation();
    _lastFollowed = position;
    if (_mapReady) _mapController.move(position, 15);
  }

  LatLng _initialCenter(TripState state, TrackingState tracking) {
    if (tracking.currentPosition != null) return tracking.currentPosition!;
    if (state.gpsPath.isNotEmpty) {
      final point = state.gpsPath.last;
      return LatLng(point.lat, point.lng);
    }
    if (state.locations.isNotEmpty) {
      final location = state.locations.first;
      return LatLng(location.lat, location.lng);
    }
    return const LatLng(59.8566, 10.5522);
  }

  void _showTrips(TripState state, List<int> tripIds) {
    if (!state.pathDataReady || state.gpsPath.isEmpty) {
      _showSnack('Trip data is still loading. Please wait a moment and retry.');
      return;
    }

    final bounds = boundsForTripIds(state.gpsPath, tripIds);
    if (bounds == null) {
      _showSnack('No GPS points found for the selected trip(s).');
      return;
    }

    state.highlightTrips(tripIds);
    if (!_mapReady) return;
    _mapController.fitCamera(
      CameraFit.bounds(
        bounds: bounds,
        padding: const EdgeInsets.all(40),
        maxZoom: 15,
      ),
    );
  }

  void _routeGuidance(int tripId) {
    _showTrips(context.read<TripState>(), [tripId]);
    _showSnack('Route guidance is not implemented yet — showing the trip.');
  }

  void _showLocationDetails(TripState state, SavedLocation location) {
    final visited = state.isVisited(location.id);
    final associatedTrip = location.tripId == null
        ? null
        : state.tripById(location.tripId!);

    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(location.name),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (visited)
              const Row(
                children: [
                  Icon(Icons.check_circle, color: kSuccessGreen, size: 18),
                  SizedBox(width: 4),
                  Text(
                    'Visited',
                    style: TextStyle(
                      color: kSuccessGreen,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            if (associatedTrip != null) ...[
              const SizedBox(height: 6),
              Text(
                'Trip: ${formatTripName(associatedTrip)}',
                style: const TextStyle(fontSize: 13),
              ),
            ],
            const SizedBox(height: 6),
            Text(
              '${location.lat.toStringAsFixed(5)}, '
              '${location.lng.toStringAsFixed(5)}',
              style: const TextStyle(fontSize: 12, color: kMutedText),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Close'),
          ),
          if (!visited)
            FilledButton(
              onPressed: () {
                Navigator.of(dialogContext).pop();
                unawaited(_markVisited(state, location));
              },
              child: const Text('Mark as Visited'),
            ),
        ],
      ),
    );
  }

  Future<void> _markVisited(TripState state, SavedLocation location) async {
    try {
      await state.markVisited(location.id);
      _showSnack('Marked ${location.name} as visited.');
    } catch (error) {
      debugPrint('Failed to mark location as visited: $error');
      _showSnack('Failed to mark as visited.');
    }
  }

  void _showSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }
}
