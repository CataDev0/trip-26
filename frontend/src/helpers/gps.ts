import { get } from "svelte/store";
import { API_BASE } from "./Constants";
import { authFetch } from "./auth";
import { Capacitor, registerPlugin } from "@capacitor/core";
import L from "leaflet";
import { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import { renderPath } from "./tripPath";
import { autoFollow, currentSpeedKmH, currentSpeedLimit, gpsPath, gpsStatus, isTracking } from "../stores/tripStore";
import { Device } from "@capacitor/device";

export class Gps {
    private map: L.Map;
    private watchId: number | string | null = null;
    private currentPositionMarker: L.CircleMarker | null = null;
    private lastSpeedLimitFetch = 0;
    private wakeLock: WakeLockSentinel | null = null;
    private offlineQueue: { lat: number; lng: number }[] = JSON.parse(
        localStorage.getItem("gpsOfflineQueue") || "[]"
    );
    private BackgroundGeolocation: BackgroundGeolocationPlugin;
    private geoLocation: Geolocation | null = null;
    private isHuawei: boolean = false;

    constructor(map: L.Map) {
        this.map = map;

        this.BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
            "BackgroundGeolocation",
        );

        Device.getInfo().then(info => {
            this.isHuawei = info.manufacturer.toLocaleLowerCase() === "huawei";
            this.geoLocation = navigator.geolocation;
        });
    }

    public async startTracking() {
        isTracking.set(true);
        gpsStatus.update(() => "Acquiring signal...");
        this.requestWakeLock();
        // Try to flush any old points when we start
        this.flushOfflineQueue(); 

        const acquireTimeout = setTimeout(() => {
            gpsStatus.update(() => "Timed out waiting for GPS. Check location permissions & GPS is enabled.");
            this.stopTracking();
            // Timout after 30 seconds
        }, 30_000); 


        if (Capacitor.isNativePlatform()) {

            if (this.isHuawei && this.geoLocation) {
                this.watchId = await this.geoLocation.watchPosition((pos) => {
                    clearTimeout(acquireTimeout);
                    this.onPositionUpdate(
                        pos.coords.latitude,
                        pos.coords.longitude,
                        pos.coords.accuracy || 0,
                        pos.coords.speed || null,
                    );
                }, (error) => {
                    clearTimeout(acquireTimeout);
                    const msg = error.message || "Unknown error";
                    gpsStatus.update(() => `GPS Error: ${msg}`);
                    this.stopTracking();
                }, { enableHighAccuracy: true, maximumAge: 0, timeout: 27000 });
            }
            else {
                this.watchId = await this.BackgroundGeolocation.addWatcher(
                    {
                        backgroundMessage: "Your position is being recorded for your trip.",
                        backgroundTitle: "Trip Tracker Running",
                        requestPermissions: true,
                        stale: false,
                        distanceFilter: 15,
                    },
                    async (position, error) => {
                        clearTimeout(acquireTimeout);
                        if (error) {
                            const msg = error.message || "Unknown error";
                            gpsStatus.update(() => `GPS Error: ${msg}`);
                            this.stopTracking();
                            return;
                        }
                        if (!position) return;
                        this.onPositionUpdate(
                            position.latitude,
                            position.longitude,
                            position.accuracy || 0,
                            position.speed || null,
                        );
                    },
                );
            }
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
                this.BackgroundGeolocation.removeWatcher({ id: String(this.watchId) });
            } else {
                navigator.geolocation.clearWatch(Number(this.watchId));
            }
            this.watchId = null;
        }
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
        if (this.currentPositionMarker) {
            this.map.removeLayer(this.currentPositionMarker);
            this.currentPositionMarker = null;
        }
    }

    public centerOnCurrentPos() {
        if (this.currentPositionMarker) {
            autoFollow.set(true);
            this.map.setView(this.currentPositionMarker.getLatLng(), 15);
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
            } catch (err: any) {
                console.error(`${err.name}, ${err.message}`);
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

    private async onPositionUpdate(lat: number,
        lng: number,
        accuracy: number,
        speed: number | null | undefined) {
        gpsStatus.update(() => `Tracking (${accuracy.toFixed(1)}m accuracy)`);
        if (speed !== null && speed !== undefined) {
            const kmh = speed * 3.6;
            currentSpeedKmH.set(Math.round(kmh));

            if (kmh > 10 && Date.now() - this.lastSpeedLimitFetch > 15000) {
                this.lastSpeedLimitFetch = Date.now();
                this.fetchSpeedLimit(lat, lng);
            }
        } else {
            currentSpeedKmH.set(null);
        }

        if (accuracy > 20) return;

        if (!this.currentPositionMarker) {
            this.currentPositionMarker = L.circleMarker([lat, lng], {
                radius: 8,
                fillColor: "#ff7800",
                color: "#000",
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8,
            }).addTo(this.map);
            if (get(autoFollow)) this.map.setView([lat, lng], 15);
        } else {
            this.currentPositionMarker.setLatLng([lat, lng]);
            if (get(autoFollow)) this.map.setView([lat, lng], 15);
        }

        const gpsPathData = get(gpsPath);
        const lastPoint = gpsPathData[gpsPathData.length - 1];
        let shouldSave = true;
        if (lastPoint) {
            const dist = this.map.distance([lat, lng], [lastPoint.lat, lastPoint.lng]);
            if (dist < 15) shouldSave = false;
        }

        if (shouldSave) {
            gpsPath.update(path => [...path, { lat, lng, timestamp: new Date().toISOString() }]);
            renderPath(this.map);

            if (this.offlineQueue.length > 0) {
                this.offlineQueue.push({ lat, lng });
                this.flushOfflineQueue();
                return;
            }

            try {
                await authFetch(API_BASE + "/api/path", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lat, lng }),
                });
            } catch (e) {
                console.error("Failed to save to DB, queueing offline", e);
                this.offlineQueue.push({ lat, lng });
                localStorage.setItem("gpsOfflineQueue", JSON.stringify(this.offlineQueue));
            }
        }
    };

    public handleVisibilityChange = () => {
        if (this.wakeLock !== null &&
        document.visibilityState === "visible" &&
        get(isTracking)
        ) {
            this.requestWakeLock();
        }
    };
}

