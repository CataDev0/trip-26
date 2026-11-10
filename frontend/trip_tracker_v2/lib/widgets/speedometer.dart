import 'package:flutter/material.dart';

import '../core/theme.dart';

/// Waze-style speedometer from V1 `Suite.svelte`.
class Speedometer extends StatefulWidget {
  const Speedometer({
    super.key,
    required this.speedKmh,
    required this.speedLimit,
    required this.overSpeed,
  });

  final double? speedKmh;
  final int? speedLimit;
  final bool overSpeed;

  @override
  State<Speedometer> createState() => _SpeedometerState();
}

class _SpeedometerState extends State<Speedometer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
    );
    _scale = Tween<double>(
      begin: 1,
      end: 1.05,
    ).animate(CurvedAnimation(parent: _pulse, curve: Curves.easeInOut));
    _syncPulse();
  }

  @override
  void didUpdateWidget(covariant Speedometer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.overSpeed != widget.overSpeed) _syncPulse();
  }

  void _syncPulse() {
    if (widget.overSpeed) {
      _pulse.repeat(reverse: true);
    } else {
      _pulse
        ..stop()
        ..value = 0;
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final speedText = widget.speedKmh == null
        ? '--'
        : '${widget.speedKmh!.round()}';

    return SizedBox(
      width: 100,
      height: 100,
      child: Stack(
        children: [
          Align(
            alignment: Alignment.center,
            child: ScaleTransition(
              scale: _scale,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: widget.overSpeed
                      ? const Color(0xFFFFCCCC)
                      : Colors.white,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: widget.overSpeed
                        ? const Color(0xFFFF4D4D)
                        : const Color(0xFFEAEAEA),
                    width: 4,
                  ),
                  boxShadow: const [
                    BoxShadow(
                      color: Colors.black26,
                      blurRadius: 10,
                      offset: Offset(0, 4),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      speedText,
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w900,
                        height: 1,
                        color: widget.overSpeed
                            ? const Color(0xFFCC0000)
                            : kDarkText,
                      ),
                    ),
                    const Text(
                      'km/h',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: kMutedText,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (widget.speedLimit != null)
            Positioned(
              top: 0,
              right: 0,
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0xFFDE2B24), width: 4),
                  boxShadow: const [
                    BoxShadow(
                      color: Colors.black26,
                      blurRadius: 5,
                      offset: Offset(0, 2),
                    ),
                  ],
                ),
                alignment: Alignment.center,
                child: Text(
                  '${widget.speedLimit}',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.black,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
