import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/constants.dart';
import '../core/theme.dart';
import '../helpers/trace_builder.dart';
import '../helpers/trace_color.dart';
import '../models/attraction.dart';
import '../models/path_point.dart';
import '../models/saved_location.dart';

enum BaseMapLayer { openStreetMap, cyclOSM }

/// Shared map widget used by both the browse screen and the tracking suite.
/// Mirrors V1's persistent Leaflet map, including the OSM / CyclOSM switcher.
class TripMap extends StatefulWidget {
  const TripMap({
    super.key,
    required this.controller,
    this.initialCenter = const LatLng(59.8566, 10.5522),
    this.initialZoom = 9,
    this.pathPoints = const [],
    this.highlightedTripIds = const {},
    this.locations = const [],
    this.visitedIds = const {},
    this.attractions = const [],
    this.currentPosition,
    this.trackingTrail = const [],
    this.showCurrentPosition = false,
    this.livePosition,
    this.liveTrail = const [],
    this.onLocationTap,
    this.onAttractionTap,
    this.onCameraChanged,
    this.onMapGesture,
    this.onMapReady,
    this.showLayerSwitcher = true,
  });

  final MapController controller;
  final LatLng initialCenter;
  final double initialZoom;
  final List<PathPoint> pathPoints;
  final Set<int> highlightedTripIds;
  final List<SavedLocation> locations;
  final Set<int> visitedIds;
  final List<Attraction> attractions;
  final LatLng? currentPosition;
  final List<LatLng> trackingTrail;
  final bool showCurrentPosition;
  final LatLng? livePosition;
  final List<LatLng> liveTrail;
  final ValueChanged<SavedLocation>? onLocationTap;
  final ValueChanged<Attraction>? onAttractionTap;
  final ValueChanged<MapCamera>? onCameraChanged;
  final VoidCallback? onMapGesture;
  final VoidCallback? onMapReady;
  final bool showLayerSwitcher;

  @override
  State<TripMap> createState() => _TripMapState();
}

class _TripMapState extends State<TripMap> {
  BaseMapLayer _baseLayer = BaseMapLayer.openStreetMap;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        FlutterMap(
          mapController: widget.controller,
          options: MapOptions(
            initialCenter: widget.initialCenter,
            initialZoom: widget.initialZoom,
            minZoom: 3,
            maxZoom: 19,
            interactionOptions: const InteractionOptions(
              flags: InteractiveFlag.all,
            ),
            onPositionChanged: (camera, hasGesture) {
              widget.onCameraChanged?.call(camera);
              if (hasGesture) widget.onMapGesture?.call();
            },
            onMapReady: widget.onMapReady,
          ),
          children: [
            _baseTileLayer(),
            if (widget.pathPoints.isNotEmpty)
              PolylineLayer(polylines: buildTripPolylines(widget.pathPoints)),
            if (widget.highlightedTripIds.isNotEmpty)
              PolylineLayer(
                polylines: buildHighlightPolylines(
                  widget.pathPoints,
                  widget.highlightedTripIds,
                ),
              ),
            if (widget.trackingTrail.length > 1)
              PolylineLayer(
                polylines: [buildBreadcrumbPolyline(widget.trackingTrail)!],
              ),
            if (widget.liveTrail.length > 1)
              PolylineLayer(polylines: _liveTrailPolylines()),
            if (widget.locations.isNotEmpty)
              MarkerLayer(markers: _locationMarkers()),
            if (widget.attractions.isNotEmpty)
              MarkerLayer(markers: _attractionMarkers()),
            if (widget.showCurrentPosition && widget.currentPosition != null)
              CircleLayer(circles: _currentPositionCircles()),
            if (widget.livePosition != null)
              MarkerLayer(markers: [_liveMarker(widget.livePosition!)]),
            RichAttributionWidget(
              alignment: AttributionAlignment.bottomLeft,
              attributions: [
                TextSourceAttribution(
                  'OpenStreetMap contributors',
                  onTap: () => launchUrl(
                    Uri.parse('https://openstreetmap.org/copyright'),
                  ),
                ),
                if (_baseLayer == BaseMapLayer.cyclOSM)
                  TextSourceAttribution(
                    'CyclOSM',
                    onTap: () =>
                        launchUrl(Uri.parse('https://www.cyclosm.org/')),
                  ),
              ],
            ),
          ],
        ),
        if (widget.showLayerSwitcher)
          Positioned(top: 12, right: 12, child: _layerSwitcher()),
      ],
    );
  }

  Widget _baseTileLayer() {
    final isCycleMap = _baseLayer == BaseMapLayer.cyclOSM;
    return TileLayer(
      key: ValueKey(_baseLayer),
      urlTemplate: isCycleMap
          ? 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png'
          : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: const ['a', 'b', 'c'],
      userAgentPackageName: appIdentifier,
      maxZoom: 19,
    );
  }

  Widget _layerSwitcher() {
    return Material(
      color: Colors.white,
      elevation: 3,
      borderRadius: BorderRadius.circular(6),
      child: PopupMenuButton<BaseMapLayer>(
        tooltip: 'Base map',
        icon: const Icon(Icons.layers_outlined, color: kDarkText),
        onSelected: (layer) => setState(() => _baseLayer = layer),
        itemBuilder: (context) => const [
          PopupMenuItem(
            value: BaseMapLayer.openStreetMap,
            child: Text('OpenStreetMap'),
          ),
          PopupMenuItem(
            value: BaseMapLayer.cyclOSM,
            child: Text('Cycle Map (CyclOSM)'),
          ),
        ],
      ),
    );
  }

  List<Polyline> _liveTrailPolylines() {
    final trail = widget.liveTrail;
    final total = trail.length - 1;
    if (total < 1) return const [];

    return [
      for (var index = 0; index < total; index++)
        Polyline(
          points: [trail[index], trail[index + 1]],
          strokeWidth: 5,
          color: HSLColor.fromAHSL(
            1,
            timeHue(index / total).toDouble(),
            1,
            0.5,
          ).toColor(),
        ),
    ];
  }

  List<Marker> _locationMarkers() {
    return [
      for (final location in widget.locations)
        Marker(
          point: LatLng(location.lat, location.lng),
          width: 36,
          height: 36,
          child: GestureDetector(
            onTap: () => widget.onLocationTap?.call(location),
            child: Tooltip(
              message: location.name,
              child: Icon(
                Icons.location_on,
                size: 34,
                color: widget.visitedIds.contains(location.id)
                    ? kSuccessGreen
                    : kPrimaryBlue,
              ),
            ),
          ),
        ),
    ];
  }

  List<Marker> _attractionMarkers() {
    return [
      for (final attraction in widget.attractions)
        Marker(
          point: LatLng(attraction.lat, attraction.lon),
          width: 30,
          height: 30,
          child: GestureDetector(
            onTap: () => widget.onAttractionTap?.call(attraction),
            child: Tooltip(
              message: attraction.name,
              child: const Icon(Icons.star, size: 28, color: Colors.deepOrange),
            ),
          ),
        ),
    ];
  }

  List<CircleMarker> _currentPositionCircles() {
    final position = widget.currentPosition!;
    return [
      CircleMarker(
        point: position,
        radius: 13,
        color: Colors.white.withValues(alpha: 0.65),
      ),
      CircleMarker(
        point: position,
        radius: 8,
        color: const Color(0xFFFF7800),
        borderColor: Colors.black,
        borderStrokeWidth: 1,
      ),
    ];
  }

  Marker _liveMarker(LatLng position) {
    return Marker(
      point: position,
      width: 20,
      height: 20,
      child: Container(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: HSLColor.fromAHSL(1, timeHue(1).toDouble(), 1, 0.5).toColor(),
          border: Border.all(color: Colors.white, width: 2),
          boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 4)],
        ),
      ),
    );
  }
}
