import 'package:flutter/material.dart';

import '../core/theme.dart';
import '../models/trip.dart';
import '../models/trip_cluster.dart';

/// Result of the "Associate with trip" dialog.
class LocationTripChoice {
  const LocationTripChoice.choose(int this.tripId) : cancelled = false;

  const LocationTripChoice.noTrip() : cancelled = false, tripId = null;

  const LocationTripChoice.cancel() : cancelled = true, tripId = null;

  final bool cancelled;
  final int? tripId;

  bool get isNoTrip => !cancelled && tripId == null;
}

/// Port of V1 `components/LocationTripChooser.svelte`.
Future<LocationTripChoice?> showLocationTripChooser(
  BuildContext context, {
  required List<TripCluster> clusters,
  required List<Trip> trips,
  required int? currentTripId,
  required String Function(Trip) tripLabel,
}) {
  final knownClusterIds = clusters.map((cluster) => cluster.id).toSet();
  final ungroupedTrips = trips
      .where(
        (trip) =>
            trip.clusterId == null || !knownClusterIds.contains(trip.clusterId),
      )
      .toList();

  return showDialog<LocationTripChoice>(
    context: context,
    builder: (dialogContext) {
      Widget tripOption(Trip trip) {
        final selected = trip.id == currentTripId;
        return _TripOption(
          label: tripLabel(trip),
          selected: selected,
          onTap: () =>
              Navigator.of(dialogContext)
                  .pop(LocationTripChoice.choose(trip.id)),
        );
      }

      return Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: 340,
            maxHeight: MediaQuery.of(dialogContext).size.height * 0.8,
          ),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Associate with trip',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: kDarkText,
                  ),
                ),
                const SizedBox(height: 10),
                Flexible(
                  child: SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        for (final cluster in clusters)
                          if (trips.any(
                            (trip) => trip.clusterId == cluster.id,
                          )) ...[
                            _GroupHeader(
                              label: cluster.name ?? 'Unnamed group',
                            ),
                            for (final trip in trips)
                              if (trip.clusterId == cluster.id)
                                tripOption(trip),
                          ],
                        if (ungroupedTrips.isNotEmpty) ...[
                          const _GroupHeader(label: 'Ungrouped'),
                          for (final trip in ungroupedTrips) tripOption(trip),
                        ],
                        if (trips.isEmpty)
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 8),
                            child: Text(
                              'No trips available.',
                              style: TextStyle(color: kMutedText),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                _TripOption(
                  label: 'No trip',
                  icon: Icons.clear,
                  selected: currentTripId == null,
                  onTap: () =>
                      Navigator.of(dialogContext)
                          .pop(const LocationTripChoice.noTrip()),
                ),
                const SizedBox(height: 4),
                _TripOption(
                  label: 'Cancel',
                  transparent: true,
                  centered: true,
                  onTap: () =>
                      Navigator.of(dialogContext)
                          .pop(const LocationTripChoice.cancel()),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
}

class _GroupHeader extends StatelessWidget {
  const _GroupHeader({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 4),
      child: Row(
        children: [
          const Icon(Icons.folder_outlined, size: 14),
          const SizedBox(width: 5),
          Text(
            label.toUpperCase(),
            style: const TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.bold,
              color: kMutedText,
            ),
          ),
        ],
      ),
    );
  }
}

class _TripOption extends StatelessWidget {
  const _TripOption({
    required this.label,
    required this.onTap,
    this.icon = Icons.place_outlined,
    this.selected = false,
    this.transparent = false,
    this.centered = false,
  });

  final String label;
  final VoidCallback onTap;
  final IconData icon;
  final bool selected;
  final bool transparent;
  final bool centered;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: TextButton(
        onPressed: onTap,
        style: TextButton.styleFrom(
          backgroundColor: transparent ? Colors.transparent : kSearchBackground,
          foregroundColor: centered ? const Color(0xFF555555) : kDarkText,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
          alignment: centered ? Alignment.center : Alignment.centerLeft,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                label,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 14.4),
              ),
            ),
            if (selected) ...[
              const Spacer(),
              const Icon(Icons.check, size: 15, color: kSuccessGreen),
            ],
          ],
        ),
      ),
    );
  }
}
