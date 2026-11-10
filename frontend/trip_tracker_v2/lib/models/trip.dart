/// Mirrors the rows returned by `GET /api/trips`.
class Trip {
  const Trip({
    required this.id,
    this.startedAt,
    this.endedAt,
    this.name,
    this.deletedAt,
    this.pointCount = 0,
    this.hidden = false,
    this.clusterId,
  });

  final int id;
  final String? startedAt;
  final String? endedAt;
  final String? name;
  final String? deletedAt;
  final int pointCount;
  final bool hidden;
  final int? clusterId;

  factory Trip.fromJson(Map<String, dynamic> json) {
    return Trip(
      id: (json['id'] as num).toInt(),
      startedAt: json['started_at'] as String?,
      endedAt: json['ended_at'] as String?,
      name: json['name'] as String?,
      deletedAt: json['deleted_at'] as String?,
      pointCount:
          (json['point_count'] as num?)?.toInt() ??
          int.tryParse('${json['point_count'] ?? 0}') ??
          0,
      hidden: (json['hidden'] as num?)?.toInt() == 1,
      clusterId: (json['cluster_id'] as num?)?.toInt(),
    );
  }
}
