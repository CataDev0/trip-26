import 'dart:math' as math;

import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../models/path_point.dart';

/// Haversine distance in metres.
double haversineMeters(double lat1, double lng1, double lat2, double lng2) {
  const earthRadius = 6371000.0;
  double toRadians(double degrees) => degrees * math.pi / 180;

  final deltaLat = toRadians(lat2 - lat1);
  final deltaLng = toRadians(lng2 - lng1);
  final a =
      math.sin(deltaLat / 2) * math.sin(deltaLat / 2) +
      math.cos(toRadians(lat1)) *
          math.cos(toRadians(lat2)) *
          math.sin(deltaLng / 2) *
          math.sin(deltaLng / 2);
  return 2 * earthRadius * math.atan2(math.sqrt(a), math.sqrt(1 - a));
}

/// Bearing in degrees (0-360) from point 1 to point 2. Returns null when the
/// points are closer than [minDistanceMeters] (no meaningful heading).
double? bearingDegrees(
  double lat1,
  double lng1,
  double lat2,
  double lng2, {
  double minDistanceMeters = 3,
}) {
  if (haversineMeters(lat1, lng1, lat2, lng2) < minDistanceMeters) return null;

  final dLon = (lng2 - lng1) * math.pi / 180;
  final lat1Rad = lat1 * math.pi / 180;
  final lat2Rad = lat2 * math.pi / 180;
  final y = math.sin(dLon) * math.cos(lat2Rad);
  final x =
      math.cos(lat1Rad) * math.sin(lat2Rad) -
      math.sin(lat1Rad) * math.cos(lat2Rad) * math.cos(dLon);
  final brng = math.atan2(y, x) * 180 / math.pi;
  return (brng + 360) % 360;
}

/// Group points by `trip_id`. When trip ids are missing, fall back to
/// splitting on a 30-minute timestamp gap or a >5 km jump, mirroring V1.
List<List<PathPoint>> splitTripsByGap(
  List<PathPoint> points, {
  Duration gap = const Duration(minutes: 30),
  double maxDistanceMeters = 5000,
}) {
  if (points.isEmpty) return const [];

  final hasTripIds = points.every((point) => point.tripId != null);
  if (hasTripIds) {
    final grouped = <int, List<PathPoint>>{};
    for (final point in points) {
      grouped.putIfAbsent(point.tripId!, () => []).add(point);
    }
    return grouped.values.toList();
  }

  final trips = <List<PathPoint>>[];
  var currentTrip = <PathPoint>[];
  DateTime? previousTimestamp;
  PathPoint? previousPoint;

  for (final point in points) {
    final nextTimestamp = point.timestamp == null
        ? null
        : DateTime.tryParse(point.timestamp!);

    var hasGap = false;
    if (currentTrip.isNotEmpty) {
      if (previousTimestamp != null &&
          nextTimestamp != null &&
          nextTimestamp.difference(previousTimestamp) > gap) {
        hasGap = true;
      } else if (previousPoint != null &&
          haversineMeters(
                previousPoint.lat,
                previousPoint.lng,
                point.lat,
                point.lng,
              ) >
              maxDistanceMeters) {
        hasGap = true;
      }
    }

    if (hasGap) {
      trips.add(currentTrip);
      currentTrip = [];
    }

    currentTrip.add(point);
    if (nextTimestamp != null) previousTimestamp = nextTimestamp;
    previousPoint = point;
  }

  if (currentTrip.isNotEmpty) trips.add(currentTrip);
  return trips;
}

/// Bounds covering every coordinate, or null for an empty list.
LatLngBounds? boundsForPoints(Iterable<LatLng> points) {
  final list = points.toList(growable: false);
  if (list.isEmpty) return null;
  return LatLngBounds.fromPoints(list);
}

/// Bounds covering all points of the given trips, or null if those trips have
/// no GPS data loaded.
LatLngBounds? boundsForTripIds(List<PathPoint> path, Iterable<int> tripIds) {
  final ids = tripIds.toSet();
  final coordinates = [
    for (final point in path)
      if (point.tripId != null && ids.contains(point.tripId))
        LatLng(point.lat, point.lng),
  ];
  return boundsForPoints(coordinates);
}
