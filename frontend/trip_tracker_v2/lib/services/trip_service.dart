import 'package:latlong2/latlong.dart';

import '../models/path_point.dart';
import '../models/trip.dart';
import 'api_client.dart';

/// Trip, GPS path, live-tracking and speed-limit endpoints from server.js.
class TripService {
  TripService(this._api);

  final ApiClient _api;

  Future<List<Trip>> fetchActiveTrips() => _fetchTrips(trashed: false);

  Future<List<Trip>> fetchTrashedTrips() => _fetchTrips(trashed: true);

  Future<List<Trip>> _fetchTrips({required bool trashed}) async {
    final data = await _api.get(
      '/api/trips',
      query: trashed ? const {'trashed': 'true'} : null,
    );
    return (data as List<dynamic>)
        .map((item) => Trip.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<int> createTrip(String name) async {
    final data = await _api.post('/api/trips', body: {'name': name});
    return (data as Map<String, dynamic>)['id'] as int;
  }

  Future<void> renameTrip(int id, String name) async {
    await _api.put('/api/trips/$id', body: {'name': name});
  }

  Future<void> setTripHidden(int id, bool hidden) async {
    await _api.post('/api/trips/$id/hidden', body: {'hidden': hidden});
  }

  Future<void> trashTrips(List<int> ids) async {
    if (ids.isEmpty) return;
    await _api.delete('/api/trips', body: {'ids': ids});
  }

  Future<void> restoreTrips(List<int> ids) async {
    if (ids.isEmpty) return;
    await _api.post('/api/trips/restore', body: {'ids': ids});
  }

  Future<void> purgeTrips(List<int> ids) async {
    if (ids.isEmpty) return;
    await _api.post('/api/trips/purge', body: {'ids': ids});
  }

  Future<List<PathPoint>> fetchPath() async {
    final data = await _api.get('/api/path');
    return (data as List<dynamic>)
        .map((item) => PathPoint.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  /// Saves one or more points. Returns the server's client-trip-id → actual
  /// trip-id mapping (client ids can collide with AUTOINCREMENT rowids).
  Future<Map<int, int>> savePathPoints(List<PathPoint> points) async {
    if (points.isEmpty) return const {};
    final data = await _api.post(
      '/api/path',
      body: points.map((point) => point.toApiJson()).toList(),
    );
    final tripIds = (data as Map<String, dynamic>?)?['tripIds'];
    if (tripIds is! Map) return const {};

    return {
      for (final entry in tripIds.entries)
        if (int.tryParse('${entry.key}') != null)
          int.parse('${entry.key}'): (entry.value as num).toInt(),
    };
  }

  Future<LatLng?> fetchLiveTracking() async {
    final data = await _api.get('/api/live-tracking');
    if (data is Map<String, dynamic>) {
      final lat = data['lat'];
      final lng = data['lng'];
      if (lat is num && lng is num) {
        return LatLng(lat.toDouble(), lng.toDouble());
      }
    }
    return null;
  }

  Future<int?> fetchSpeedLimit(double lat, double lng) async {
    final data = await _api.get(
      '/api/speed-limit',
      query: {'lat': '$lat', 'lng': '$lng'},
    );
    if (data is Map<String, dynamic>) {
      final limit = data['speedLimit'];
      if (limit is num) return limit.toInt();
    }
    return null;
  }
}
