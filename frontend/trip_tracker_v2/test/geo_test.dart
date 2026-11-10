import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';

import 'package:trip_tracker_v2/helpers/geo.dart';
import 'package:trip_tracker_v2/models/path_point.dart';

void main() {
  test('haversineMeters measures one degree of latitude', () {
    expect(haversineMeters(0, 0, 1, 0), closeTo(111195, 200));
  });

  test('splitTripsByGap groups points by trip id', () {
    final points = [
      const PathPoint(lat: 59.9, lng: 10.7, tripId: 1),
      const PathPoint(lat: 59.91, lng: 10.71, tripId: 1),
      const PathPoint(lat: 59.95, lng: 10.75, tripId: 2),
    ];

    final trips = splitTripsByGap(points);
    expect(trips.length, 2);
    expect(trips[0].length, 2);
    expect(trips[1].length, 1);
  });

  test('boundsForPoints returns null for no points', () {
    expect(boundsForPoints(const []), isNull);
  });

  test('boundsForPoints covers all coordinates', () {
    final bounds = boundsForPoints(const [LatLng(10, 20), LatLng(30, 40)]);

    expect(bounds, isNotNull);
    expect(bounds!.south, 10);
    expect(bounds.north, 30);
    expect(bounds.west, 20);
    expect(bounds.east, 40);
  });

  test('bearingDegrees reports north for a northward move', () {
    expect(bearingDegrees(59.9, 10.7, 59.91, 10.7), closeTo(0, 1));
  });
}
