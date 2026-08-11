import { get } from "svelte/store";
import { API_BASE } from "./Constants";
import { authFetch } from "./auth";
import { Capacitor } from "@capacitor/core";
import L from "leaflet";
import { renderPath } from "./tripPath";
import { autoFollow, currentSpeedKmH, currentSpeedLimit, gpsPath, gpsStatus, isTracking } from "../stores/tripStore";

export class Gps {
    private map: L.Map;
    private watchId: number | string | null = null;
    private currentPositionMarker: L.CircleMarker | null = null;
    private lastSpeedLimitFetch = 0;
    private wakeLock: WakeLockSentinel | null = null;
    private offlineQueue: { lat: number; lng: number }[] = JSON.parse(
        localStorage.getItem("gpsOfflineQueue") || "[]"
    );
    private geoLocation: Geolocation;
    private mapViewOptions: L.ZoomPanOptions = { animate: true, "easeLinearity": 0.25, "duration": 0.25 };
    private currentTripId: number | null = null;
    private lastLat: number | null = null;
    private lastLng: number | null = null;
    private lastBearing: number | null = null;

    constructor(map: L.Map) {
        this.map = map;
        this.geoLocation = navigator.geolocation;
    }

    public async startTracking() {
        // Client generated
        // No need to be online to start tracking
        this.currentTripId = Date.now(); 

        isTracking.set(true);
        gpsStatus.update(() => "Acquiring signal...");
        this.requestWakeLock();
        // Try to flush any old points at the start
        this.flushOfflineQueue();

        const acquireTimeout = setTimeout(() => {
            gpsStatus.update(() => "Timed out waiting for GPS. Check location permissions & GPS is enabled.");
            this.stopTracking();
            // Timout after 30 seconds
        }, 30_000);


        if (Capacitor.isNativePlatform()) {
            this.watchId = this.geoLocation.watchPosition((pos) => {
                clearTimeout(acquireTimeout);
                this.onPositionUpdate(
                    pos.coords.latitude,
                    pos.coords.longitude,
                    pos.coords.accuracy || 0,
                    pos.coords.speed || null,
                    pos.coords.heading || null
                );
            }, (error) => {
                clearTimeout(acquireTimeout);
                const msg = error.message || "Unknown error";
                gpsStatus.update(() => `GPS Error: ${msg}`);
                this.stopTracking();
            }, { enableHighAccuracy: true, maximumAge: 0, timeout: 27000 });
        } else {
            if (!navigator.geolocation) {
                alert("Geolocation is not supported by your browser");
                return;
            }
            this.watchId = navigator.geolocation.watchPosition(
                async (position) => {
                    clearTimeout(acquireTimeout);
                    this.onPositionUpdate(
                        position.coords.latitude,
                        position.coords.longitude,
                        position.coords.accuracy || 0,
                        position.coords.speed || null,
                        position.coords.heading || null
                    );
                },
                (error) => {
                    clearTimeout(acquireTimeout);
                    let msg = error.message || "Unknown error";
                    if (error.code === 1) msg = "Permission denied.";
                    else if (error.code === 2) msg = "Position unavailable.";
                    else if (error.code === 3) msg = "Timeout acquiring GPS signal.";

                    gpsStatus.update(() => `GPS Error: ${msg}`);
                    this.stopTracking();
                },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 27000 },
            );
        }
    }

    public stopTracking() {
        if (this.watchId !== null) {
            if (Capacitor.isNativePlatform()) {
                if (this.geoLocation) {
                    this.geoLocation.clearWatch(Number(this.watchId));
                } else {
                    navigator.geolocation.clearWatch(Number(this.watchId));
                }
            } else {
                navigator.geolocation.clearWatch(Number(this.watchId));
            }
            this.watchId = null;
            if (this.wakeLock !== null) {
                this.wakeLock.release().then(() => {
                    this.wakeLock = null;
                });
            }
            isTracking.set(false);
            currentSpeedKmH.set(null);
            currentSpeedLimit.set(null);
            autoFollow.set(true);
            gpsStatus.set("GPS: Stopped");
            this.lastLat = null;
            this.lastLng = null;
            this.lastBearing = null;
            if (this.currentPositionMarker) {
                this.map.removeLayer(this.currentPositionMarker);
                this.currentPositionMarker = null;
            }
        }
    }

    public centerOnCurrentPos() {
        if (this.currentPositionMarker) {
            autoFollow.set(true);
            this.map.setView(this.currentPositionMarker.getLatLng(), 15, this.mapViewOptions);
        } else {
            alert("No GPS position available yet.");
        }
    }

    private async flushOfflineQueue() {
        if (this.offlineQueue.length === 0) return;
        try {
            const res = await authFetch(API_BASE + "/api/path", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(this.offlineQueue),
            });
            if (res.ok) {
                this.offlineQueue = [];
                localStorage.setItem("gpsOfflineQueue", "[]");
            }
        } catch {
            console.log("Still offline, queue length:", this.offlineQueue.length);
        }
    }

    private async requestWakeLock() {
        if ("wakeLock" in navigator) {
            try {
                this.wakeLock = await (navigator as Navigator).wakeLock.request("screen");
            } catch (err) {
                if (err instanceof Error) {
                    console.error(`${err.name}: ${err.message}`);
                } else {
                    console.error("Unknown error:", err);
                }
            }
        }
    }

    private async fetchSpeedLimit(lat: number, lng: number) {
        try {
            const res = await fetch(
                API_BASE + `/api/speed-limit?lat=${lat}&lng=${lng}`,
            );
            if (!res.ok) throw new Error("Proxy failed");
            const data = await res.json();
            currentSpeedLimit.update(() => data.speedLimit);
        } catch (e) {
            console.error("Failed to fetch speed limit from proxy", e);
        }
    }

    private async onPositionUpdate(lat: number, lng: number, accuracy: number, speed: number | null | undefined, bearing?: number | null) {
        gpsStatus.update(() => `Tracking (${accuracy.toFixed(1)}m accuracy)`);
        let kmh: number | null = null;
        if (speed !== null && speed !== undefined) {
            kmh = speed * 3.6;
            currentSpeedKmH.set(Math.round(kmh));

            if (kmh > 10 && Date.now() - this.lastSpeedLimitFetch > 15000) {
                this.lastSpeedLimitFetch = Date.now();
                this.fetchSpeedLimit(lat, lng);
            }
        } else {
            currentSpeedKmH.set(null);
        }

        if (accuracy > 20) return;

        // Calculate heading: prefer device bearing, fall back to movement direction
        let effectiveBearing: number | null = null;
        if (bearing !== null && bearing !== undefined && !isNaN(bearing) && bearing >= 0) {
            effectiveBearing = bearing;
        } else if (this.lastLat !== null && this.lastLng !== null) {
            const moved = this.computeBearing(this.lastLat, this.lastLng, lat, lng);
            if (moved !== null) {
                effectiveBearing = moved;
            }
        }

        // Smooth bearing transitions: only update if the change is meaningful
        if (effectiveBearing !== null) {
            if (this.lastBearing !== null) {
                // Interpolate bearing for smooth rotation
                let delta = effectiveBearing - this.lastBearing;
                if (delta > 180) delta -= 360;
                if (delta < -180) delta += 360;
                effectiveBearing = this.lastBearing + delta * 0.5;
            }
            this.lastBearing = effectiveBearing;
        }

        const gpsPathData = get(gpsPath);
        const lastPoint = gpsPathData[gpsPathData.length - 1];

        if (!this.currentPositionMarker) {
            this.currentPositionMarker = L.circleMarker([lat, lng], {
                radius: 8,
                fillColor: "#ff7800",
                color: "#000",
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8,
            }).addTo(this.map);
            if (get(autoFollow)) this.centerOnPosition(lat, lng, effectiveBearing);
        } else {
            this.currentPositionMarker.setLatLng([lat, lng]);
            if (get(autoFollow)) this.centerOnPosition(lat, lng, effectiveBearing);
        }

        // Store position for next bearing calculation
        this.lastLat = lat;
        this.lastLng = lng;

        let shouldSave = true;
        if (lastPoint) {
            const dist = this.map.distance([lat, lng], [lastPoint.lat, lastPoint.lng]);
            if (dist < 15) shouldSave = false;
        }

        if (shouldSave) {
            const point = { lat, lng, timestamp: new Date().toISOString(), tripId: this.currentTripId, speed: kmh };
            gpsPath.update(path => [...path, point]);
            renderPath(this.map);

            if (this.offlineQueue.length > 0) {
                this.offlineQueue.push(point);
                this.flushOfflineQueue();
                return;
            }

            try {
                await authFetch(API_BASE + "/api/path", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(point),
                });
            } catch (e) {
                console.error("Failed to save to DB, queueing offline", e);
                this.offlineQueue.push(point);
                localStorage.setItem("gpsOfflineQueue", JSON.stringify(this.offlineQueue));
            }
        }
    };

    /**
     * Calculate bearing between two lat/lng points.
     * Returns bearing in degrees (0-360) or null if points are too close.
     */
    private computeBearing(lat1: number, lng1: number, lat2: number, lng2: number): number | null {
        const dLon = ((lng2 - lng1) * Math.PI) / 180;
        const lat1Rad = (lat1 * Math.PI) / 180;
        const lat2Rad = (lat2 * Math.PI) / 180;
        const y = Math.sin(dLon) * Math.cos(lat2Rad);
        const x =
            Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
        const brng = (Math.atan2(y, x) * 180) / Math.PI;
        // Require at least ~3 meters of movement before reporting a bearing
        const dist = this.map.distance([lat1, lng1], [lat2, lng2]);
        if (dist < 3) return this.lastBearing;
        return ((brng + 360) % 360);
    }

    /**
     * Center the map on the given position, offset so the marker appears
     * in the lower half of the screen, and rotate toward bearing.
     */
    private centerOnPosition(lat: number, lng: number, bearing: number | null) {
        const mapSize = this.map.getSize();
        // Offset by ~15% of map height upward so the position appears in the lower portion
        const offsetY = Math.round(mapSize.y * 0.15);
        const targetPoint = this.map.latLngToContainerPoint([lat, lng]);
        const offsetPoint = L.point(targetPoint.x, targetPoint.y - offsetY);
        const centerLatLng = this.map.containerPointToLatLng(offsetPoint);

        this.map.setView(centerLatLng, 15, this.mapViewOptions);
        if (bearing !== null && bearing !== undefined) {
            this.map.setBearing(bearing);
        }
    }

    public handleVisibilityChange = () => {
        if (this.wakeLock !== null &&
            document.visibilityState === "visible" &&
            get(isTracking)
        ) {
            this.requestWakeLock();
        }
    };
}

