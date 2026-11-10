import 'package:flutter/material.dart';
import 'package:trip_tracker_v2/core/constants.dart';
import 'package:trip_tracker_v2/core/theme.dart';

class TopBar extends StatelessWidget {
  final String title;
  final String? version;
  final int? visitorCount;
  final bool showVisitorCount;

  const TopBar({
    super.key,
    required this.visitorCount,
    this.showVisitorCount = true,

    this.title = appTitle,
    this.version = appVersion,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.blueGrey,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 19.2,
              fontWeight: FontWeight.bold,
              color: kDarkText,
              height: 1.1,
            ),
          ),
          if (version != null)
            Text(
              version!,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: kDarkText,
              ),
            ),
          if (showVisitorCount && visitorCount != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: kVisitorPink,
                borderRadius: BorderRadius.circular(25),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '$visitorCount',
                    style: const TextStyle(
                      fontSize: 14.4,
                      color: Colors.white,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(width: 5),
                  const Icon(
                    Icons.remove_red_eye_outlined,
                    size: 18,
                    color: Colors.white,
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
