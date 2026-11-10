import 'dart:async';

import 'package:flutter/material.dart' hide NavigationBar;
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import 'package:trip_tracker_v2/widgets/top_bar.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/constants.dart';
import '../core/theme.dart';
import '../helpers/date_formatters.dart';
import '../helpers/geo.dart';
import '../models/attraction.dart';
import '../models/saved_location.dart';
import '../services/attraction_service.dart';
import '../state/app_state.dart';
import '../state/trip_state.dart';
import '../widgets/app_button.dart';
import '../widgets/side_bar.dart';
import '../widgets/navigation_bar.dart';
import '../widgets/trip_map.dart';

/// Port of V1 `App.svelte` — the public map view.
class MapScreen extends StatefulWidget {
  const MapScreen({super.key});

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  final _mapController = MapController();

  bool _sidebarExpanded = false;
  bool _mapReady = false;
  bool _dataLoaded = false;
  bool _didInitialView = false;
  bool _findingAttractions = false;
  double _currentZoom = 9;
  List<Attraction> _attractions = const [];

  @override
  void initState() {
    super.initState();
    final tripState = context.read<TripState>();
    unawaited(
      tripState.loadAll().then((_) {
        if (!mounted) return;
        _dataLoaded = true;
        _maybeApplyInitialView();
      }),
    );
  }

  @override
  void dispose() {
    _mapController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tripState = context.watch<TripState>();
    final appState = context.watch<AppState>();

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
                TopBar(visitorCount: appState.visitorCount),
                Expanded(
                  child: isMobile
                      ? _mapArea(tripState, appState)
                      : Row(
                          children: [
                            if (_sidebarExpanded)
                              SizedBox(width: sidebarWidth, child: sidebar),
                            Expanded(child: _mapArea(tripState, appState)),
                          ],
                        ),
                ),
                NavigationBar(
                  showSidebarToggle: true,
                  onToggleSidebar: () => _toggleSidebar(isMobile),
                  actions: _topBarActions(tripState, appState),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  List<Widget> _topBarActions(TripState tripState, AppState appState) {
    final canFindAttractions = _currentZoom >= minAttractionsZoom;

    return [
      AppButton(
        label: _findingAttractions
            ? 'Loading...'
            : canFindAttractions
            ? 'Find Attractions'
            : 'Zoom In',
        icon: Icons.travel_explore,
        busy: _findingAttractions,
        onPressed: canFindAttractions
            ? () => _findAttractions(tripState)
            : null,
      ),
      if (appState.isLiveTracking)
        AppButton(
          label: 'Follow Live Tracking',
          icon: Icons.my_location,
          color: kSuccessGreen,
          textColor: Colors.black,
          onPressed: () => _followLive(appState),
        ),
      AppButton(
        label: 'Tracking',
        icon: Icons.login,
        color: kWarningYellow,
        textColor: Colors.black,
        onPressed: () => Navigator.of(context).pushNamed('/suite'),
      ),
    ];
  }

  Widget _mapArea(TripState tripState, AppState appState) {
    return Stack(
      children: [
        Positioned.fill(
          child: TripMap(
            controller: _mapController,
            pathPoints: tripState.gpsPath,
            highlightedTripIds: tripState.highlightedTripIds,
            locations: tripState.locations,
            visitedIds: tripState.visitedIds,
            attractions: _attractions,
            livePosition: appState.livePosition,
            liveTrail: appState.liveTrail,
            onLocationTap: (location) =>
                _showLocationDetails(tripState, location),
            onAttractionTap: _showAttractionDetails,
            onMapReady: () {
              _mapReady = true;
              _maybeApplyInitialView();
            },
            onCameraChanged: _onCameraChanged,
          ),
        ),
        if (tripState.mapDataLoading && !tripState.pathDataReady)
          Positioned(
            top: 12,
            left: 12,
            child: Card(
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: const [
                    SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                    SizedBox(width: 8),
                    Text(
                      'Loading map data...',
                      style: TextStyle(fontSize: 12.8),
                    ),
                  ],
                ),
              ),
            ),
          ),
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

  void _onCameraChanged(MapCamera camera) {
    final zoom = camera.zoom;
    final crossedThreshold =
        (zoom >= minAttractionsZoom) != (_currentZoom >= minAttractionsZoom);
    if (crossedThreshold || (zoom - _currentZoom).abs() > 1.5) {
      setState(() => _currentZoom = zoom);
    } else {
      _currentZoom = zoom;
    }
  }

  void _maybeApplyInitialView() {
    if (!_mapReady || !_dataLoaded || _didInitialView) return;
    _didInitialView = true;
    unawaited(_applyInitialView());
  }

  Future<void> _applyInitialView() async {
    final tripState = context.read<TripState>();

    LatLng? current;
    try {
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.always ||
          permission == LocationPermission.whileInUse) {
        final position = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.medium,
            timeLimit: Duration(seconds: 5),
          ),
        );
        current = LatLng(position.latitude, position.longitude);
      } else {
        final last = await Geolocator.getLastKnownPosition();
        if (last != null) {
          current = LatLng(last.latitude, last.longitude);
        }
      }
    } catch (_) {
      // No permission / no fix — fall back to trip data below.
    }

    if (!mounted) return;
    if (current != null) {
      _mapController.move(current, 13);
      return;
    }

    final bounds = boundsForTripIds(
      tripState.gpsPath,
      tripState.trips.map((trip) => trip.id),
    );
    if (bounds != null) {
      _mapController.fitCamera(
        CameraFit.bounds(
          bounds: bounds,
          padding: const EdgeInsets.all(40),
          maxZoom: 13,
        ),
      );
      return;
    }

    if (tripState.locations.isNotEmpty) {
      final first = tripState.locations.first;
      _mapController.move(LatLng(first.lat, first.lng), 13);
    }
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
    // Route playback/guidance is a "Could have" in the MoSCoW — highlight the
    // trip for now; the dedicated guidance view lands later.
    _showTrips(context.read<TripState>(), [tripId]);
    _showSnack('Route guidance is not implemented yet — showing the trip.');
  }

  Future<void> _findAttractions(TripState tripState) async {
    if (!_mapReady) return;
    setState(() => _findingAttractions = true);

    try {
      final bounds = _mapController.camera.visibleBounds;
      final attractions = await context.read<AttractionService>().fetchNearby(
        south: bounds.south,
        west: bounds.west,
        north: bounds.north,
        east: bounds.east,
      );
      if (!mounted) return;
      setState(() => _attractions = attractions);
      _showSnack(
        attractions.isEmpty
            ? 'No attractions found in this area.'
            : '${attractions.length} attractions found.',
      );
    } catch (error) {
      debugPrint('Failed to fetch attractions: $error');
      _showSnack('Failed to load attractions.');
    } finally {
      if (mounted) setState(() => _findingAttractions = false);
    }
  }

  void _followLive(AppState appState) {
    final position = appState.livePosition;
    if (position == null || !_mapReady) return;
    _mapController.move(position, 16);
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
        ],
      ),
    );
  }

  void _showAttractionDetails(Attraction attraction) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(attraction.name),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(attraction.type),
            const SizedBox(height: 6),
            Text(
              '${attraction.lat.toStringAsFixed(5)}, '
              '${attraction.lon.toStringAsFixed(5)}',
              style: const TextStyle(fontSize: 12, color: kMutedText),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Close'),
          ),
          TextButton(
            onPressed: () => launchUrl(
              Uri.parse(
                'https://www.openstreetmap.org/?mlat=${attraction.lat}'
                '&mlon=${attraction.lon}#map=17/${attraction.lat}/${attraction.lon}',
              ),
            ),
            child: const Text('Open in OSM'),
          ),
        ],
      ),
    );
  }

  void _showSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }
}
