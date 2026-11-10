/// A single GPS fix from `/api/path` (or queued locally while offline).
class PathPoint {
  const PathPoint({
    this.id,
    this.tripId,
    required this.lat,
    required this.lng,
    this.timestamp,
    this.currentSpeed,
  });

  final int? id;
  final int? tripId;
  final double lat;
  final double lng;

  /// ISO-8601 timestamp. The server requires one when saving points.
  final String? timestamp;

  /// km/h, null for legacy rows that predate speed recording.
  final double? currentSpeed;

  factory PathPoint.fromJson(Map<String, dynamic> json) {
    return PathPoint(
      id: _asInt(json['id']),
      tripId: _asInt(json['trip_id']),
      lat: _asDouble(json['lat']) ?? 0,
      lng: _asDouble(json['lng']) ?? 0,
      timestamp: json['timestamp'] as String?,
      currentSpeed: _asDouble(json['current_speed']),
    );
  }

  /// Parses either the GET shape (`trip_id`/`current_speed`) or the POST /
  /// offline-queue shape (`tripId`/`speed`).
  factory PathPoint.fromApiJson(Map<String, dynamic> json) {
    return PathPoint(
      id: _asInt(json['id']),
      tripId: _asInt(json['tripId'] ?? json['trip_id']),
      lat: _asDouble(json['lat']) ?? 0,
      lng: _asDouble(json['lng']) ?? 0,
      timestamp: json['timestamp'] as String?,
      currentSpeed: _asDouble(json['speed'] ?? json['current_speed']),
    );
  }

  /// Shape expected by `POST /api/path` (camelCase `tripId`/`speed`).
  Map<String, dynamic> toApiJson() {
    return {
      'lat': lat,
      'lng': lng,
      'timestamp': timestamp ?? DateTime.now().toUtc().toIso8601String(),
      'tripId': tripId,
      if (currentSpeed != null) 'speed': currentSpeed,
    };
  }

  PathPoint copyWith({int? tripId}) {
    return PathPoint(
      id: id,
      tripId: tripId ?? this.tripId,
      lat: lat,
      lng: lng,
      timestamp: timestamp,
      currentSpeed: currentSpeed,
    );
  }
}

int? _asInt(Object? value) {
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value);
  return null;
}

double? _asDouble(Object? value) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value);
  return null;
}
