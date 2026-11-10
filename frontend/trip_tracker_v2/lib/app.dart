import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/constants.dart';
import 'core/theme.dart';
import 'screens/map_screen.dart';
import 'screens/suite_screen.dart';
import 'services/auth_service.dart';
import 'widgets/login_modal.dart';

class TripTrackerApp extends StatelessWidget {
  const TripTrackerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: appTitle,
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      initialRoute: '/',
      routes: {
        '/': (_) => const MapScreen(),
        '/suite': (_) => const SuiteScreen(),
      },
      // V1 mounts LoginModal next to the SPA router so any 401 can summon it.
      builder: (context, child) =>
          _AuthOverlay(child: child ?? const SizedBox.shrink()),
    );
  }
}

class _AuthOverlay extends StatelessWidget {
  const _AuthOverlay({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();

    return Stack(
      textDirection: TextDirection.ltr,
      children: [
        child,
        if (auth.loginRequested) const Positioned.fill(child: LoginModal()),
      ],
    );
  }
}
