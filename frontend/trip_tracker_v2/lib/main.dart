import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/constants.dart';
import 'services/api_client.dart';
import 'services/attraction_service.dart';
import 'services/auth_service.dart';
import 'services/cluster_service.dart';
import 'services/location_service.dart';
import 'services/tracking_service.dart';
import 'services/trip_service.dart';
import 'services/visitor_service.dart';
import 'state/app_state.dart';
import 'state/tracking_state.dart';
import 'state/trip_state.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final prefs = await SharedPreferences.getInstance();

  final authService = AuthService(prefs)..load();
  final apiClient = ApiClient(baseUrl: apiBaseUrl, auth: authService);
  final tripService = TripService(apiClient);

  final tripState = TripState(
    tripService: tripService,
    clusterService: ClusterService(apiClient),
    locationService: LocationService(apiClient),
  );
  final appState = AppState(
    visitorService: VisitorService(apiClient),
    tripService: tripService,
    prefs: prefs,
  );
  final trackingState = TrackingState(
    tripService: tripService,
    trackingService: TrackingService(),
    prefs: prefs,
  );

  unawaited(appState.start());

  runApp(
    MultiProvider(
      providers: [
        InheritedProvider<AuthService>.value(value: authService),
        Provider<ApiClient>.value(value: apiClient),
        Provider<AttractionService>.value(value: AttractionService()),
        ChangeNotifierProvider<TripState>.value(value: tripState),
        ChangeNotifierProvider<AppState>.value(value: appState),
        ChangeNotifierProvider<TrackingState>.value(value: trackingState),
      ],
      child: const TripTrackerApp(),
    ),
  );
}
