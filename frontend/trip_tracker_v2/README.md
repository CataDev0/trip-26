# Trip Tracker V2 (Flutter)

Flutter rewrite of the V1 frontend (`../src`, Svelte + Leaflet). It talks to
the same Express/SQLite backend in the repository root.

The scaffold keeps V1's separation of concerns but maps it to Flutter idioms:

| V1 (Svelte/TS) | V2 (Flutter/Dart) | Responsibility |
| --- | --- | --- |
| `App.svelte` | `lib/screens/map_screen.dart` | Public map: trips, locations, live tracking, attractions |
| `Suite.svelte` | `lib/screens/suite_screen.dart` | Tracking suite: start/stop, speedometer, follow position |
| `Edit.svelte` | *not ported* | Editing suite is a MoSCoW "Won't have" |
| `components/TopBar.svelte` | `lib/widgets/navigation_bar.dart` | Bottom control bar: title, version, visitor count, actions |
| `components/SideBar.svelte` | `lib/widgets/side_bar.dart` | Trips, groups, locations, trash, search/sort |
| `components/LoginModal.svelte` | `lib/widgets/login_modal.dart` | Basic-auth prompt on 401 |
| `components/GroupChooser.svelte` | `lib/widgets/group_chooser.dart` | Assign trips to groups |
| `components/LocationTripChooser.svelte` | `lib/widgets/location_trip_chooser.dart` | Associate a location with a trip |
| `helpers/auth.ts` | `lib/services/auth_service.dart`, `api_client.dart` | Token storage + authenticated HTTP |
| `helpers/trips.ts` / `clusters.ts` | `lib/services/trip_service.dart`, `cluster_service.dart` | API calls |
| `helpers/locationMarkers.ts` / `mapData.ts` | `lib/services/location_service.dart`, `lib/state/trip_state.dart` | Locations, visited marks, bootstrap data |
| `helpers/gps.ts` | `lib/state/tracking_state.dart`, `lib/services/tracking_service.dart` | GPS stream, speed, offline queue |
| `helpers/liveTracking.ts` | `lib/state/app_state.dart` + `trip_service.dart` | Live-position polling |
| `helpers/traceColor.ts` / `tripPath.ts` | `lib/helpers/trace_color.dart`, `trace_builder.dart`, `geo.dart` | Colour palette, trip splitting, polylines |
| `stores/*.ts` | `lib/state/*.dart` | `ChangeNotifier` + `provider` instead of Svelte stores |
| `typed/Typed.ts` | `lib/models/*.dart` | JSON models |

## Layout

```text
lib/
  main.dart                 app bootstrap, providers, dependency wiring
  app.dart                  MaterialApp routes + global login overlay
  core/                     constants (API base) and V1 theme colours
  models/                   Trip, TripCluster, PathPoint, SavedLocation,
                            Attraction, TravelMode
  services/                 HTTP + platform integrations (auth, trips,
                            clusters, locations, visitors, attractions,
                            geolocation)
  state/                    app / trips / tracking ChangeNotifiers
  helpers/                  pure helpers: trace colours, polyline building,
                            haversine, dates
  screens/                  map_screen (V1 App), suite_screen (V1 Suite)
  widgets/                  NavigationBar (bottom), SideBar, LoginModal,
                            choosers, map, speedometer, travel-mode selector
```

## MoSCoW status

| Priority | Feature | Status in this scaffold |
| --- | --- | --- |
| Must | Map | ✅ OSM + CyclOSM layers, speed/time-coloured traces, location pins, live position |
| Must | Background tracking | ⚠️ Geolocator foreground service on Android (persistent notification) and `UIBackgroundModes: location` on iOS. Survives backgrounding, but not the OS killing the process — see the note below |
| Must | Modes (Car/Bike/Walking) | ✅ Persisted `TravelMode`, selector in the suite, iOS activity type wired |
| Should | Speed limits | ✅ HERE proxy polled while moving >10 km/h, 15 s throttle, over-speed speedometer |
| Should | Offline saving | ✅ Failed GPS writes go to a JSON queue in `SharedPreferences` and flush on start/retry |
| Could | Route playback / live guidance | 🚧 Sidebar action highlights the trip and tells the user it is not implemented yet |
| Could | Tunnel/obstacle correction | ❌ Not started |
| Won't | Editing suite | ❌ Intentionally omitted (no `/edit` screen or Geoman equivalent) |

### Background tracking caveat

`geolocator` raises the Android process priority with a foreground-service
notification, but Google's docs note this does **not** keep a new Flutter
engine alive if the activity is destroyed. For kill-proof recording, add a
dedicated background service (`flutter_background_service`,
`flutter_foreground_task`, or the commercial `flutter_background_geolocation`)
and drive it from `TrackingService` / `TrackingState`. The rest of the app
already treats tracking as app-level state, so that swap is isolated.

## Running

1. Start the backend from the repository root (see root `README.md`):

   ```bash
   cp .env.example .env   # set ADMIN_USERNAME / ADMIN_PASSWORD
   npm install
   npm start              # listens on 0.0.0.0:3000
   ```

2. Get Flutter dependencies and run:

   ```bash
   flutter pub get
   flutter run -d chrome           # web (CORS may need CORS_ORIGINS on the server)
   flutter run -d linux            # desktop
   flutter run                     # attached Android/iOS device
   ```

3. Point the app at the backend when it is not on the default host:

   ```bash
   flutter run --dart-define=API_BASE=http://192.168.1.20:3000
   ```

   Defaults (`lib/core/constants.dart`):

   - Android emulator: `http://10.0.2.2:3000` (the host's loopback)
   - everything else: `http://localhost:3000`

   For a physical phone, use the computer's LAN IP and make sure the server is
   reachable on the network (it binds `0.0.0.0`).

### Platform permissions

- **Android** (`android/app/src/main/AndroidManifest.xml`): fine/coarse and
  background location, foreground-service + location, notifications, wake lock,
  and `usesCleartextTraffic="true"` for the local HTTP backend. Remove cleartext
  when the API is served over HTTPS.
- **iOS** (`ios/Runner/Info.plist`): location usage strings, `location`
  background mode, and ATS `NSAllowsArbitraryLoads` for local HTTP. Tighten ATS
  for production.
- Background tracking is meaningful only on mobile; browsers throttle/stop
  geolocation when the tab is not active.

## Auth and local state

- Credentials are stored the V1 way: base64(`username:password`) in
  `SharedPreferences` and sent as `Authorization: Basic ...`. A 401 asks
  `AuthService` to show the global login overlay.
- The offline GPS queue and selected travel mode are also in
  `SharedPreferences`.
- After login, the screens reload the data so hidden trips/groups become
  visible; logging out reloads the public dataset.

## Development checks

```bash
flutter analyze
flutter test
flutter build web
```

## Next steps

- A proper background service for kill-proof recording.
- Move trip-trace simplification to zoom-aware budgets (V1's
  `simplifyTripByBudget`); V2 currently caps segments per trip and in total.
- Attraction popups with images / "save as location" (V1 parity).
- Native share sheet and file export (V2 currently copies to the clipboard).
- Route playback and car guidance (MoSCoW "Could have").
