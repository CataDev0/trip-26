import '../models/saved_location.dart';
import 'api_client.dart';

/// Saved-location and visited-location endpoints from server.js.
class LocationService {
  LocationService(this._api);

  final ApiClient _api;

  Future<List<SavedLocation>> fetchLocations() async {
    final data = await _api.get('/api/locations');
    return (data as List<dynamic>)
        .map((item) => SavedLocation.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<Set<int>> fetchVisitedIds() async {
    final data = await _api.get('/api/visited');
    return (data as List<dynamic>).map((id) => (id as num).toInt()).toSet();
  }

  Future<void> markVisited(int id) async {
    await _api.post('/api/visited', body: {'id': id});
  }

  Future<void> unmarkVisited(int id) async {
    await _api.delete('/api/visited/$id');
  }

  Future<void> setLocationTrip(int id, int? tripId) async {
    await _api.put('/api/locations/$id/trip', body: {'tripId': tripId});
  }
}
