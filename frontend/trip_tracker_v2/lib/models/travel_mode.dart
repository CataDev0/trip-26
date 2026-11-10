/// MoSCoW "Must have": travel modes for the tracker.
///
/// The mode is persisted with the recording settings and handed to the
/// platform location stream (iOS activity type). Future V2 work can use it to
/// tune save distance, accuracy and guidance.
enum TravelMode {
  car('Car'),
  bike('Bike'),
  walking('Walking');

  const TravelMode(this.label);

  final String label;

  static TravelMode fromStorage(String? value) {
    for (final mode in values) {
      if (mode.name == value) return mode;
    }
    return TravelMode.car;
  }
}
