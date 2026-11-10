import 'package:flutter/material.dart' hide NavigationBar;
import 'package:flutter_test/flutter_test.dart';

import 'package:trip_tracker_v2/widgets/navigation_bar.dart';

void main() {
  testWidgets('NavigationBar shows title, version and visitor count', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: NavigationBar())),
    );

    expect(find.text('Trip Tracker'), findsOneWidget);
    expect(find.text('V2'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
  });
}
