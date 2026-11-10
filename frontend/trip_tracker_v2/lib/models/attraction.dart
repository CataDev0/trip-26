/// A nearby attraction returned by the Overpass API.
class Attraction {
  const Attraction({
    required this.id,
    required this.name,
    required this.lat,
    required this.lon,
    this.tags = const {},
  });

  final int id;
  final String name;
  final double lat;
  final double lon;
  final Map<String, String> tags;

  factory Attraction.fromOverpassJson(Map<String, dynamic> json) {
    final rawTags = json['tags'];
    final tags = <String, String>{};
    if (rawTags is Map) {
      for (final entry in rawTags.entries) {
        tags['${entry.key}'] = '${entry.value}';
      }
    }

    return Attraction(
      id: (json['id'] as num?)?.toInt() ?? 0,
      name: tags['name:en'] ?? tags['name'] ?? _typeFromTags(tags),
      lat: (json['lat'] as num?)?.toDouble() ?? 0,
      lon: (json['lon'] as num?)?.toDouble() ?? 0,
      tags: tags,
    );
  }

  String get type => _typeFromTags(tags);

  static String _typeFromTags(Map<String, String> tags) {
    var value =
        tags['tourism'] ?? tags['historic'] ?? tags['amenity'] ?? 'attraction';
    if (value == 'yes') value = 'Historic Site';
    if (value.isEmpty) return 'Attraction';
    return value
        .replaceAll('_', ' ')
        .split(' ')
        .where((word) => word.isNotEmpty)
        .map((word) => '${word[0].toUpperCase()}${word.substring(1)}')
        .join(' ');
  }
}
