import 'package:flutter/material.dart';

/// Colour palette carried over from the V1 stylesheet (src/app.css).
const Color kPrimaryBlue = Color(0xFF007BFF);
const Color kPrimaryBlueDark = Color(0xFF0056B3);
const Color kSecondaryGrey = Color(0xFF6C757D);
const Color kSecondaryGreyDark = Color(0xFF545B62);
const Color kDangerRed = Color(0xFFDC3545);
const Color kDangerRedDark = Color(0xFFC82333);
const Color kWarningYellow = Color(0xFFFFC107);
const Color kAccentOrange = Color(0xFFFF8C00);
const Color kSuccessGreen = Color(0xFF28A745);
const Color kVisitorPink = Color(0xFFD732A8);

const Color kControlsBackground = Color(0xFFF8F9FA);
const Color kSidebarHeaderBackground = Color(0xFFF1F1F1);
const Color kGroupHeaderBackground = Color(0xFFF6F8FA);
const Color kSearchBackground = Color(0xFFF1F3F5);
const Color kHoverBackground = Color(0xFFE2E6EA);
const Color kSelectedBackground = Color(0xFFE7F1FF);
const Color kHighlightedBackground = Color(0xFFFFF3E0);
const Color kBorder = Color(0xFFDDDDDD);
const Color kLightBorder = Color(0xFFEEEEEE);
const Color kMutedText = Color(0xFF777777);
const Color kDarkText = Color(0xFF333333);

ThemeData buildAppTheme() {
  final colorScheme = ColorScheme.fromSeed(seedColor: kPrimaryBlue).copyWith(
    primary: kPrimaryBlue,
    secondary: kSecondaryGrey,
    error: kDangerRed,
  );

  final base = ThemeData(useMaterial3: true, colorScheme: colorScheme);
  return base.copyWith(
    scaffoldBackgroundColor: Colors.white,
    dividerColor: kBorder,
    textTheme: base.textTheme.apply(
      bodyColor: kDarkText,
      displayColor: kDarkText,
    ),
  );
}
