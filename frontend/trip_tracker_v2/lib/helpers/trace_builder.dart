import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../core/constants.dart';
import '../models/path_point.dart';
import 'geo.dart';
import 'trace_color.dart';

/// Builds one polyline per coloured segment, like V1's Leaflet trace renderer.
///
/// Basic V2 simplification: sample at most [maxSegmentsPerTrip] segments per
/// trip. V1 additionally simplifies by zoom level; that is a TODO for V2.
List<Polyline> buildTripPolylines(
  List<PathPoint> points, {
  double strokeWidth = 5,
  int maxSegments = maxSegmentsPerTrip,
  int maxTotalSegments = 4000,
}) {
  final polylines = <Polyline>[];

  for (final trip in splitTripsByGap(points)) {
    if (polylines.length >= maxTotalSegments) break;
    if (trip.length < 2) continue;

    final speeds = fillSpeedGaps(
      trip.map((point) => point.currentSpeed).toList(),
    );
    final stride = math.max(1, ((trip.length - 1) / maxSegments).ceil());

    for (var start = 0; start < trip.length - 1; start += stride) {
      if (polylines.length >= maxTotalSegments) break;
      final end = math.min(start + stride, trip.length - 1);
      final a = trip[start];
      final b = trip[end];
      if (a.lat == b.lat && a.lng == b.lng) continue;

      final double hue;
      if (speeds != null) {
        hue = speedHue(averageSpeed(speeds, start, end)).toDouble();
      } else {
        hue = timeHue(start / (trip.length - 1)).toDouble();
      }

      polylines.add(
        Polyline(
          points: [LatLng(a.lat, a.lng), LatLng(b.lat, b.lng)],
          strokeWidth: strokeWidth,
          color: HSLColor.fromAHSL(1, hue, 1, 0.5).toColor(),
        ),
      );
    }
  }

  return polylines;
}

/// Solid highlight used for "Show on map" selections (orange line with a
/// white casing, matching V1's trip-selection pane).
List<Polyline> buildHighlightPolylines(
  List<PathPoint> path,
  Iterable<int> tripIds,
) {
  final ids = tripIds.toSet();
  final grouped = <int, List<LatLng>>{};

  for (final point in path) {
    if (point.tripId == null || !ids.contains(point.tripId)) continue;
    grouped
        .putIfAbsent(point.tripId!, () => [])
        .add(LatLng(point.lat, point.lng));
  }

  final polylines = <Polyline>[];
  for (final coordinates in grouped.values) {
    if (coordinates.length < 2) continue;

    // White casing underneath, orange line on top.
    polylines
      ..add(Polyline(points: coordinates, strokeWidth: 9, color: Colors.white))
      ..add(
        Polyline(
          points: coordinates,
          strokeWidth: 5,
          color: const Color(0xFFFF8C00),
        ),
      );
  }

  return polylines;
}

/// Single-colour trace used while actively recording.
Polyline? buildBreadcrumbPolyline(
  List<LatLng> trail, {
  Color color = const Color(0xFFFF8C00),
  double strokeWidth = 5,
}) {
  if (trail.length < 2) return null;
  return Polyline(points: trail, strokeWidth: strokeWidth, color: color);
}
