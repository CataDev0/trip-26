// Port of V1 src/helpers/traceColor.ts. Pure functions only, so the colour
// logic can be unit-tested without Flutter or a map.

const double maxSpeedKmh = 120;

// Flightradar24-style speed palette: green (slow) → yellow → orange →
// red → purple (fast).
const List<({double speed, double hue})> speedStops = [
  (speed: 0, hue: 120), // green
  (speed: 40, hue: 60), // yellow
  (speed: 70, hue: 30), // orange
  (speed: 100, hue: 0), // red
  (speed: 120, hue: 280), // purple
];

double _clamp01(double value) => value.clamp(0.0, 1.0);

double _normalizeHue(double hue) => ((hue % 360) + 360) % 360;

/// Hue for a speed in km/h, using the V1 speed palette.
int speedHue(double kmh) {
  final value = kmh.clamp(0.0, maxSpeedKmh);

  var i = 0;
  while (i < speedStops.length - 2 && value > speedStops[i + 1].speed) {
    i++;
  }
  final a = speedStops[i];
  final b = speedStops[i + 1];
  final t = (value - a.speed) / (b.speed - a.speed);

  // Wrap-aware shortest signed hue delta, so 0° (red) → 280° (purple)
  // passes through magenta instead of teal.
  final delta = ((((b.hue - a.hue) % 360) + 540) % 360) - 180;
  return _normalizeHue(a.hue + delta * t).round();
}

/// Hue for a fraction along a trip, used for legacy trips without speeds.
int timeHue(double fraction) => (280 - _clamp01(fraction) * 160).round();

/// Fill missing speeds by linear interpolation between the nearest known
/// speeds, by point index. Returns null when no speed is known at all
/// (legacy trip → time gradient).
List<double>? fillSpeedGaps(List<double?> speeds) {
  final knownIndices = <int>[];
  for (var i = 0; i < speeds.length; i++) {
    final speed = speeds[i];
    if (speed != null && speed.isFinite) knownIndices.add(i);
  }

  if (knownIndices.isEmpty) return null;

  final filled = List<double>.filled(speeds.length, 0);
  if (knownIndices.length == 1) {
    filled.fillRange(0, filled.length, speeds[knownIndices.first]!);
    return filled;
  }

  var nextKnown = 0;
  for (var i = 0; i < speeds.length; i++) {
    final speed = speeds[i];
    if (speed != null && speed.isFinite) {
      filled[i] = speed;
      continue;
    }

    while (nextKnown < knownIndices.length && knownIndices[nextKnown] < i) {
      nextKnown++;
    }

    if (nextKnown == 0) {
      filled[i] = speeds[knownIndices.first]!;
    } else if (nextKnown >= knownIndices.length) {
      filled[i] = speeds[knownIndices.last]!;
    } else {
      final below = knownIndices[nextKnown - 1];
      final above = knownIndices[nextKnown];
      final t = (i - below) / (above - below);
      filled[i] = speeds[below]! * (1 - t) + speeds[above]! * t;
    }
  }

  return filled;
}

/// Average speed between two point indices (used to colour long segments).
double averageSpeed(List<double> speeds, int from, int to) {
  if (to < from) return 0;
  var sum = 0.0;
  for (var i = from; i <= to; i++) {
    sum += speeds[i];
  }
  return sum / (to - from + 1);
}
