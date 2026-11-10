import 'api_client.dart';

/// Live visitor counter shown in the top bar.
class VisitorService {
  VisitorService(this._api);

  final ApiClient _api;

  Future<int> fetchCount(String visitorId) async {
    final data = await _api.get('/api/visitors', query: {'id': visitorId});
    if (data is Map<String, dynamic> && data['count'] is num) {
      return (data['count'] as num).toInt();
    }
    return 1;
  }
}
