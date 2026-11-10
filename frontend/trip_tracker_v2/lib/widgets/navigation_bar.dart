import 'package:flutter/material.dart';

import '../core/constants.dart';
import '../core/theme.dart';

/// Port of V1 `components/TopBar.svelte`, shown at the bottom of the screen
/// for better thumb reach on mobile.
///
/// Flutter Material also exports a `NavigationBar`; files that use both must
/// import Material with `hide NavigationBar`.
class NavigationBar extends StatelessWidget {
  const NavigationBar({
    super.key,
    this.title = appTitle,
    this.version = appVersion,
    this.statusText,
    this.showSidebarToggle = false,
    this.onToggleSidebar,
    this.actions = const [],
  });

  final String title;
  final String? version;
  final String? statusText;
  final bool showSidebarToggle;
  final VoidCallback? onToggleSidebar;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: kControlsBackground,
        border: Border(top: BorderSide(color: kBorder)),
      ),
      // Extend the bar background behind the home indicator / gesture inset,
      // padding its contents instead of leaving a gap below the bar.
      child: SafeArea(
        top: false,
        left: false,
        right: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                spacing: 10,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  if (showSidebarToggle)
                    Material(
                      color: kPrimaryBlue,
                      borderRadius: BorderRadius.circular(4),
                      child: InkWell(
                        onTap: onToggleSidebar,
                        borderRadius: BorderRadius.circular(4),
                        child: const Padding(
                          padding: EdgeInsets.all(7),
                          child: Icon(
                            Icons.menu,
                            color: Colors.white,
                            size: 20,
                          ),
                        ),
                      ),
                    ),
                  ...actions,
                ],
              ),
              if (statusText != null && statusText!.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    statusText!,
                    style: const TextStyle(fontSize: 13, color: kMutedText),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
