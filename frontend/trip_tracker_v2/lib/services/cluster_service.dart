import '../models/trip_cluster.dart';
import 'api_client.dart';

/// Trip group ("cluster") endpoints from server.js.
class ClusterService {
  ClusterService(this._api);

  final ApiClient _api;

  Future<List<TripCluster>> fetchClusters() async {
    final data = await _api.get('/api/clusters');
    return (data as List<dynamic>)
        .map((item) => TripCluster.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<int> createCluster(String name) async {
    final data = await _api.post('/api/clusters', body: {'name': name});
    return (data as Map<String, dynamic>)['id'] as int;
  }

  Future<void> renameCluster(int id, String name) async {
    await _api.put('/api/clusters/$id', body: {'name': name});
  }

  Future<void> setClusterHidden(int id, bool hidden) async {
    await _api.post('/api/clusters/$id/hidden', body: {'hidden': hidden});
  }

  Future<void> deleteCluster(int id) async {
    await _api.delete('/api/clusters/$id');
  }

  /// Assign trips to a cluster, or ungroup them when [clusterId] is null.
  Future<void> assignTripsToCluster(List<int> tripIds, int? clusterId) async {
    if (tripIds.isEmpty) return;
    await _api.post(
      '/api/clusters/assign',
      body: {'tripIds': tripIds, 'clusterId': clusterId},
    );
  }
}
