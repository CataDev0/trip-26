/// Mirrors the rows returned by `GET /api/locations`.
class SavedLocation {
  const SavedLocation({
    required this.id,
    required this.name,
    required this.lat,
    required this.lng,
    this.tripId,
  });

  final int id;
  final String name;
  final double lat;
  final double lng;
  final int? tripId;

  factory SavedLocation.fromJson(Map<String, dynamic> json) {
    return SavedLocation(
      id: (json['id'] as num).toInt(),
      name: json['name'] as String? ?? '',
      lat: (json['lat'] as num).toDouble(),
      lng: (json['lng'] as num).toDouble(),
      tripId: (json['trip_id'] as num?)?.toInt(),
    );
  }

  SavedLocation withTripId(int? tripId) {
    return SavedLocation(
      id: id,
      name: name,
      lat: lat,
      lng: lng,
      tripId: tripId,
    );
  }
}
