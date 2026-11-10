import 'package:flutter_test/flutter_test.dart';

import 'package:trip_tracker_v2/helpers/trace_color.dart';

void main() {
  group('speedHue', () {
    test('matches the V1 palette stops', () {
      expect(speedHue(0), 120);
      expect(speedHue(40), 60);
      expect(speedHue(70), 30);
      expect(speedHue(100), 0);
      expect(speedHue(120), 280);
    });

    test('clamps speeds outside 0-120 km/h', () {
      expect(speedHue(-20), 120);
      expect(speedHue(500), 280);
    });
  });

  group('fillSpeedGaps', () {
    test('interpolates missing speeds', () {
      expect(fillSpeedGaps([0, null, 20]), [0, 10, 20]);
    });

    test('holds the nearest known speed at the edges', () {
      expect(fillSpeedGaps([null, 10, null]), [10, 10, 10]);
    });

    test('returns null for legacy trips without speed data', () {
      expect(fillSpeedGaps([null, null, null]), isNull);
    });
  });

  test('timeHue runs from violet to green', () {
    expect(timeHue(0), 280);
    expect(timeHue(1), 120);
  });
}
