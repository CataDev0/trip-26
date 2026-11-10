import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/attraction.dart';

/// Fetches nearby museums / historic sites / attractions from Overpass.
///
/// Port of V1's `fetchAndRenderAttractions` network portion; rendering lives
/// in the map widget.
class AttractionService {
  AttractionService({http.Client? httpClient})
    : _http = httpClient ?? http.Client();

  final http.Client _http;

  Future<List<Attraction>> fetchNearby({
    required double south,
    required double west,
    required double north,
    required double east,
  }) async {
    final bbox = '$south,$west,$north,$east';
    final query =
        '[out:json][timeout:25];'
        '(node["tourism"="museum"]($bbox);'
        'node["historic"]($bbox);'
        'node["tourism"="attraction"]($bbox););out;';
    final uri = Uri.https('overpass-api.de', '/api/interpreter', {
      'data': query,
    });

    http.Response? response;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        response = await _http
            .get(uri, headers: const {'User-Agent': 'trip-tracker-v2'})
            .timeout(const Duration(seconds: 30));
        if (response.statusCode == 200) break;
        if (response.statusCode != 429 && response.statusCode != 504) break;
      } on TimeoutException {
        response = null;
      } on http.ClientException {
        response = null;
      }

      if (attempt < 2) {
        await Future<void>.delayed(Duration(seconds: 2 * (attempt + 1)));
      }
    }

    if (response == null || response.statusCode != 200) return const [];

    final data = jsonDecode(response.body);
    final elements = data is Map ? data['elements'] : null;
    if (elements is! List) return const [];

    return [
      for (final element in elements)
        if (element is Map<String, dynamic>)
          if (element['lat'] is num && element['lon'] is num)
            Attraction.fromOverpassJson(element),
    ];
  }

  void dispose() {
    _http.close();
  }
}
