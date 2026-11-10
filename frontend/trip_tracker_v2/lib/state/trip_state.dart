// Constructors intentionally assign private dependencies to keep the
// internals of this notifier private.
// ignore_for_file: prefer_initializing_formals

import 'dart:collection';

import 'package:flutter/foundation.dart';

import '../models/path_point.dart';
import '../models/saved_location.dart';
import '../models/trip.dart';
import '../models/trip_cluster.dart';
import '../services/api_client.dart';
import '../services/cluster_service.dart';
import '../services/location_service.dart';
import '../services/trip_service.dart';

/// Equivalent of V1's `tripStore` + `editStore` (editing is out of scope for V2).
class TripState extends ChangeNotifier {
  TripState({
    required TripService tripService,
    required ClusterService clusterService,
    required LocationService locationService,
  }) : _tripService = tripService,
       _clusterService = clusterService,
       _locationService = locationService;

  final TripService _tripService;
  final ClusterService _clusterService;
  final LocationService _locationService;

  List<Trip> _trips = const [];
  List<Trip> _trashedTrips = const [];
  List<TripCluster> _clusters = const [];
  List<SavedLocation> _locations = const [];
  Set<int> _visitedIds = {};
  List<PathPoint> _gpsPath = const [];
  final Set<int> _selectedTripIds = {};
  Set<int> _highlightedTripIds = {};

  bool _tripsLoading = false;
  bool _mapDataLoading = false;
  bool _pathDataReady = false;
  String? _tripsError;
  String? _mapDataError;

  UnmodifiableListView<Trip> get trips => UnmodifiableListView(_trips);
  UnmodifiableListView<Trip> get trashedTrips =>
      UnmodifiableListView(_trashedTrips);
  UnmodifiableListView<TripCluster> get clusters =>
      UnmodifiableListView(_clusters);
  UnmodifiableListView<SavedLocation> get locations =>
      UnmodifiableListView(_locations);
  UnmodifiableSetView<int> get visitedIds => UnmodifiableSetView(_visitedIds);
  UnmodifiableListView<PathPoint> get gpsPath => UnmodifiableListView(_gpsPath);
  UnmodifiableSetView<int> get selectedTripIds =>
      UnmodifiableSetView(_selectedTripIds);
  UnmodifiableSetView<int> get highlightedTripIds =>
      UnmodifiableSetView(_highlightedTripIds);

  List<int> get selectedTripIdsList => _selectedTripIds.toList();

  bool get tripsLoading => _tripsLoading;
  bool get mapDataLoading => _mapDataLoading;
  bool get pathDataReady => _pathDataReady;
  String? get tripsError => _tripsError;
  String? get mapDataError => _mapDataError;

  bool isTripSelected(int id) => _selectedTripIds.contains(id);
  bool isTripHighlighted(int id) => _highlightedTripIds.contains(id);
  bool isVisited(int locationId) => _visitedIds.contains(locationId);

  /// Loads active trips, trash and groups (V1 SideBar's `loadTrips`).
  Future<void> loadTrips() async {
    _tripsLoading = true;
    _tripsError = null;
    notifyListeners();

    try {
      final results = await Future.wait<Object>([
        _tripService.fetchActiveTrips(),
        _tripService.fetchTrashedTrips(),
        _clusterService.fetchClusters(),
      ]);
      _trips = results[0] as List<Trip>;
      _trashedTrips = results[1] as List<Trip>;
      _clusters = results[2] as List<TripCluster>;
    } catch (error) {
      _tripsError = _messageFor(error);
    } finally {
      _tripsLoading = false;
      notifyListeners();
    }
  }

  /// Loads locations, visited marks and the GPS path (V1 `loadData`).
  Future<void> loadMapData() async {
    _mapDataLoading = true;
    _mapDataError = null;
    notifyListeners();

    try {
      final results = await Future.wait<Object>([
        _locationService.fetchLocations(),
        _locationService.fetchVisitedIds(),
        _tripService.fetchPath(),
      ]);
      _locations = results[0] as List<SavedLocation>;
      _visitedIds = results[1] as Set<int>;
      _gpsPath = results[2] as List<PathPoint>;
      _pathDataReady = true;
    } catch (error) {
      _mapDataError = _messageFor(error);
    } finally {
      _mapDataLoading = false;
      notifyListeners();
    }
  }

  Future<void> loadAll() async {
    await Future.wait([loadTrips(), loadMapData()]);
  }

  Future<void> createTrip(String name) async {
    await _tripService.createTrip(name);
    await loadTrips();
  }

  Future<void> renameTrip(int id, String name) async {
    await _tripService.renameTrip(id, name);
    await loadTrips();
  }

  Future<void> setTripHidden(int id, bool hidden) async {
    await _tripService.setTripHidden(id, hidden);
    await loadTrips();
  }

  Future<void> removeTrips(List<int> ids) async {
    await _tripService.trashTrips(ids);
    _selectedTripIds.removeAll(ids);
    _highlightedTripIds.removeAll(ids);
    await loadTrips();
  }

  Future<void> restoreTrips(List<int> ids) async {
    await _tripService.restoreTrips(ids);
    await loadTrips();
  }

  Future<void> purgeTrips(List<int> ids) async {
    await _tripService.purgeTrips(ids);
    _selectedTripIds.removeAll(ids);
    _highlightedTripIds.removeAll(ids);
    await loadTrips();
    await loadMapData();
  }

  Future<int> createCluster(String name) async {
    final id = await _clusterService.createCluster(name);
    await loadTrips();
    return id;
  }

  Future<void> renameCluster(int id, String name) async {
    await _clusterService.renameCluster(id, name);
    await loadTrips();
  }

  Future<void> setClusterHidden(int id, bool hidden) async {
    await _clusterService.setClusterHidden(id, hidden);
    await loadTrips();
  }

  Future<void> deleteCluster(int id) async {
    await _clusterService.deleteCluster(id);
    await loadTrips();
  }

  Future<void> assignTripsToCluster(List<int> tripIds, int? clusterId) async {
    await _clusterService.assignTripsToCluster(tripIds, clusterId);
    await loadTrips();
  }

  // --- Selection / highlighting -------------------------------------------

  void toggleSelected(int id) {
    if (!_selectedTripIds.remove(id)) {
      _selectedTripIds.add(id);
    }
    notifyListeners();
  }

  void clearSelection() {
    if (_selectedTripIds.isEmpty) return;
    _selectedTripIds.clear();
    notifyListeners();
  }

  void highlightTrips(Iterable<int> ids) {
    _highlightedTripIds = ids.toSet();
    notifyListeners();
  }

  void clearHighlightedTrips() {
    if (_highlightedTripIds.isEmpty) return;
    _highlightedTripIds.clear();
    notifyListeners();
  }

  // --- Locations -----------------------------------------------------------

  Future<void> markVisited(int id) async {
    await _locationService.markVisited(id);
    _visitedIds.add(id);
    notifyListeners();
  }

  Future<void> unmarkVisited(int id) async {
    await _locationService.unmarkVisited(id);
    _visitedIds.remove(id);
    notifyListeners();
  }

  Future<void> setLocationTrip(int locationId, int? tripId) async {
    await _locationService.setLocationTrip(locationId, tripId);
    _locations = [
      for (final location in _locations)
        if (location.id == locationId)
          location.withTripId(tripId)
        else
          location,
    ];
    notifyListeners();
  }

  // --- Path helpers --------------------------------------------------------

  List<PathPoint> pointsForTripIds(Iterable<int> tripIds) {
    final ids = tripIds.toSet();
    return [
      for (final point in _gpsPath)
        if (point.tripId != null && ids.contains(point.tripId)) point,
    ];
  }

  Trip? tripById(int id) {
    for (final trip in _trips) {
      if (trip.id == id) return trip;
    }
    return null;
  }

  TripCluster? clusterById(int id) {
    for (final cluster in _clusters) {
      if (cluster.id == id) return cluster;
    }
    return null;
  }

  String _messageFor(Object error) {
    if (error is ApiException) return error.message;
    return error.toString();
  }
}
