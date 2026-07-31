export class Utils {
    static liveTrackTimer = null;
    static isLiveTracking = false;

    static haversineMeters(lat1, lng1, lat2, lng2) {
        const earthRadius = 6371000;
        const toRadians = (degrees) => (degrees * Math.PI) / 180;
        const deltaLat = toRadians(lat2 - lat1);
        const deltaLng = toRadians(lng2 - lng1);
        const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(toRadians(lat1)) *
            Math.cos(toRadians(lat2)) *
            Math.sin(deltaLng / 2) *
            Math.sin(deltaLng / 2);
        return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    static simplifyDP(points, distanceThresholdMeters) {
        if (points.length <= 2) return new Set(points.map((p) => p.id));

        const tolDegrees = distanceThresholdMeters / 111320;
        const sqTolerance = tolDegrees * tolDegrees;

        const keptSet = new Set();
        const last = points.length - 1;

        keptSet.add(points[0].id);
        Utils.simplifyDPStep(points, 0, last, sqTolerance, keptSet);
        keptSet.add(points[last].id);

        return keptSet;
    }

    // Douglas-Peucker simplification
    static simplifyDPStep(points, first, last, sqTolerance, keptSet) {
        let maxSqDist = sqTolerance;
        let index = -1;

        for (let i = first + 1; i < last; i++) {
            const sqDist = Utils.segDistSq(points[i], points[first], points[last]);
            if (sqDist > maxSqDist) {
                index = i;
                maxSqDist = sqDist;
            }
        }

        if (maxSqDist > sqTolerance) {
            if (index - first > 1)
                Utils.simplifyDPStep(points, first, index, sqTolerance, keptSet);
            keptSet.add(points[index].id);
            if (last - index > 1)
                Utils.simplifyDPStep(points, index, last, sqTolerance, keptSet);
        }
    }

    // Math helpers for DP
    static segDistSq(pt, p1, p2) {
        let x = p1.lat;
        let y = p1.lng;
        let dx = p2.lat - x;
        let dy = p2.lng - y;

        if (dx !== 0 || dy !== 0) {
            const t = ((pt.lat - x) * dx + (pt.lng - y) * dy) / (dx * dx + dy * dy);
            if (t > 1) {
                x = p2.lat;
                y = p2.lng;
            } else if (t > 0) {
                x += dx * t;
                y += dy * t;
            }
        }

        dx = pt.lat - x;
        dy = pt.lng - y;

        // Scale longitude by cos(latitude)
        const latRad = pt.lat * (Math.PI / 180);
        dy = dy * Math.cos(latRad);

        return dx * dx + dy * dy;
    }

    static resetLiveTrackTimer() {
        if (!Utils.isLiveTracking) {
            Utils.isLiveTracking = true;
        }

        if (Utils.liveTrackTimer) {
            clearTimeout(Utils.liveTrackTimer);
        }
        Utils.liveTrackTimer = setTimeout(() => {
            Utils.isLiveTracking = false;
            // 5 minutes
        }, 60_000 * 5);
    }

    /**
     * 
     * @param {PathPoint[]} pathData 
     * @param {number} gapMinutes 
     * @returns {PathPoint[][]}
     */
    static SplitTripsByGap(
        pathData,
        gapMinutes,
    ) {
        const trips = [];
        let currentTrip = [];
        const gapMs = gapMinutes * 60 * 1000;
        let previousTimestamp = null;
        let previousPoint = null;

        for (const point of pathData) {
            const nextTimestamp = point.timestamp ? Date.parse(point.timestamp) : Number.NaN;
            let hasGap = false;

            if (currentTrip.length > 0) {
                // Split trips if timestamps are longer than gapMinutes (30m)
                if (previousTimestamp !== null && Number.isFinite(nextTimestamp) && (nextTimestamp - previousTimestamp > gapMs)) {
                    hasGap = true;
                } else if (previousPoint !== null) {
                    // Break trips apart if the distance is larger than (5km)
                    const dist = Utils.haversineMeters(previousPoint.lat, previousPoint.lng, point.lat, point.lng);
                    if (dist > 5000) {
                        hasGap = true;
                    }
                }
            }

            if (hasGap) {
                trips.push(currentTrip);
                currentTrip = [];
            }

            currentTrip.push(point);

            if (Number.isFinite(nextTimestamp)) {
                previousTimestamp = nextTimestamp;
            }
            previousPoint = point;
        }

        if (currentTrip.length > 0) {
            trips.push(currentTrip);
        }

        return trips;
    }

    /**
     * Calculates the distance between two GPS coordinates using the Haversine formula.
     * @param {number} lat1 - Latitude of the first point in degrees.
     * @param {number} lng1 - Longitude of the first point in degrees.
     * @param {number} lat2 - Latitude of the second point in degrees.
     * @param {number} lng2 - Longitude of the second point in degrees.
     * @returns {number} - Distance between the two points in meters.
     */
    static haversineMeters(lat1, lng1, lat2, lng2) {
        const earthRadius = 6371000;
        const toRadians = (degrees) => (degrees * Math.PI) / 180;
        const deltaLat = toRadians(lat2 - lat1);
        const deltaLng = toRadians(lng2 - lng1);
        const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(toRadians(lat1)) *
            Math.cos(toRadians(lat2)) *
            Math.sin(deltaLng / 2) *
            Math.sin(deltaLng / 2);
        return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}