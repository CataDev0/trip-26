import '../models/trip.dart';

const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

DateTime? _parse(String? isoString) {
  if (isoString == null || isoString.isEmpty) return null;
  return DateTime.tryParse(isoString)?.toLocal();
}

/// Short label used for unnamed trips ("New Trip Nov 10").
String shortDate(String? isoString) {
  final date = _parse(isoString);
  if (date == null) return '';
  return '${_months[date.month - 1]} ${date.day}';
}

/// Full timestamp used in trip metadata and share text.
String formatDate(String? isoString) {
  final date = _parse(isoString);
  if (date == null) return 'Unknown date';
  final hour = date.hour.toString().padLeft(2, '0');
  final minute = date.minute.toString().padLeft(2, '0');
  return '${_months[date.month - 1]} ${date.day}, ${date.year}, $hour:$minute';
}

String formatTripName(Trip trip) {
  final name = trip.name?.trim();
  if (name != null && name.isNotEmpty) return name;
  return 'New Trip ${shortDate(trip.startedAt)}';
}
