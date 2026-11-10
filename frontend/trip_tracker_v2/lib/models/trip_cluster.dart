/// Mirrors the rows returned by `GET /api/clusters`. Called a "group" in the UI.
class TripCluster {
  const TripCluster({required this.id, this.name, this.hidden = false});

  final int id;
  final String? name;
  final bool hidden;

  factory TripCluster.fromJson(Map<String, dynamic> json) {
    return TripCluster(
      id: (json['id'] as num).toInt(),
      name: json['name'] as String?,
      hidden: (json['hidden'] as num?)?.toInt() == 1,
    );
  }
}
