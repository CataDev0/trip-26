import 'package:flutter/material.dart';

import '../core/theme.dart';
import '../models/travel_mode.dart';

/// Car / Bike / Walking picker for the tracking suite.
class TravelModeSelector extends StatelessWidget {
  const TravelModeSelector({
    super.key,
    required this.mode,
    required this.enabled,
    required this.onChanged,
  });

  final TravelMode mode;
  final bool enabled;
  final ValueChanged<TravelMode> onChanged;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: enabled ? 'Travel mode' : 'Stop tracking to change mode',
      child: Material(
        color: enabled ? Colors.white : kControlsBackground,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(4),
          side: const BorderSide(color: kBorder),
        ),
        child: PopupMenuButton<TravelMode>(
          enabled: enabled,
          tooltip: '',
          initialValue: mode,
          onSelected: onChanged,
          itemBuilder: (context) => [
            for (final value in TravelMode.values)
              PopupMenuItem(
                value: value,
                child: Row(
                  children: [
                    Icon(_iconFor(value), size: 18, color: kMutedText),
                    const SizedBox(width: 8),
                    Expanded(child: Text(value.label)),
                    if (value == mode)
                      const Icon(Icons.check, size: 16, color: kSuccessGreen),
                  ],
                ),
              ),
          ],
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  _iconFor(mode),
                  size: 18,
                  color: enabled ? kDarkText : kMutedText,
                ),
                const SizedBox(width: 6),
                Text(
                  mode.label,
                  style: TextStyle(
                    fontSize: 14.4,
                    color: enabled ? kDarkText : kMutedText,
                  ),
                ),
                const Icon(Icons.arrow_drop_down, size: 18, color: kMutedText),
              ],
            ),
          ),
        ),
      ),
    );
  }

  IconData _iconFor(TravelMode value) {
    return switch (value) {
      TravelMode.car => Icons.directions_car,
      TravelMode.bike => Icons.directions_bike,
      TravelMode.walking => Icons.directions_walk,
    };
  }
}
