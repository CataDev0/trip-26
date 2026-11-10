import 'package:flutter/material.dart';

import '../core/theme.dart';

/// The `.btn` from V1's stylesheet, as a small reusable widget.
class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    this.icon,
    this.color = kPrimaryBlue,
    this.textColor = Colors.white,
    this.onPressed,
    this.small = false,
    this.busy = false,
  });

  final String label;
  final IconData? icon;
  final Color color;
  final Color textColor;
  final VoidCallback? onPressed;
  final bool small;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final horizontal = small ? 8.0 : 16.0;
    final vertical = small ? 6.0 : 8.0;

    return FilledButton(
      onPressed: busy ? null : onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: color,
        foregroundColor: textColor,
        disabledBackgroundColor: color.withValues(alpha: 0.45),
        disabledForegroundColor: textColor.withValues(alpha: 0.8),
        elevation: 0,
        padding: EdgeInsets.symmetric(
          horizontal: horizontal,
          vertical: vertical,
        ),
        minimumSize: Size(0, small ? 30 : 36),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
        textStyle: TextStyle(
          fontSize: small ? 12.8 : 14.4,
          fontWeight: FontWeight.w500,
        ),
      ),
      child: busy
          ? SizedBox(
              width: small ? 12 : 14,
              height: small ? 12 : 14,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: textColor,
              ),
            )
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (icon != null) ...[
                  Icon(icon, size: small ? 14 : 16),
                  const SizedBox(width: 4),
                ],
                Text(label),
              ],
            ),
    );
  }
}
