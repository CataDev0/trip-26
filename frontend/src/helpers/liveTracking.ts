import { get } from "svelte/store";
import L from "leaflet";
import { API_BASE } from "./Constants";
import { isLiveTracking, liveTrackingLayer } from "../stores/appStore";

// The purpose of the class is to manage the local client state when
// following live tracking from the server
export class LiveTracking {

    private liveCoords: L.LatLng[] = [];
    private segmentLayers: L.Polyline[] = [];
    private icon: L.Marker = L.marker([0, 0]);
    private map: L.Map | null = null;

    init(map: L.Map) {
        this.map = map;
        let group = get(liveTrackingLayer);
   
        // We dont expect group to be null
        if (!group.getLayers) {
            group = L.layerGroup();
            liveTrackingLayer.set(group);
        }

        if (!map.hasLayer(group)) {
            group.addTo(map);
        }
    }

    hueForFraction(fraction: number): number {
        return 280 - fraction * 160;
    }

    async updateLiveTracking() {
        const loc = await LiveTracking.getLiveTracking();
        isLiveTracking.set(!!loc);
        if (!loc) return;

        this.liveCoords.push(L.latLng(loc.lat, loc.lng));

        const group = get(liveTrackingLayer);

        // Clear old segments and redraw the whole trip with a fresh gradient
        this.segmentLayers.forEach((seg) => group.removeLayer(seg));
        this.segmentLayers = [];
        group.removeLayer(this.icon);

        const total = this.liveCoords.length - 1;
        // Need at least 2 points to draw a segment
        if (total < 1) return; 

        for (let i = 0; i < total; i++) {
            const fraction = i / total;
            const hue = this.hueForFraction(fraction);

            const segment = L.polyline([this.liveCoords[i], this.liveCoords[i + 1]], {
                color: `hsl(${hue}, 100%, 50%)`,
                weight: 5,
            });
            segment.addTo(group);
            this.icon = L.marker(this.liveCoords[i + 1], {
                text: "Live Location",
                icon: L.divIcon({
                    className: "live-tracking-icon",
                    html: `<div style="background-color:hsl(${hue}, 100%, 50%); width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`,
                }),
            });
            this.icon.bindPopup("Live Location");
            this.icon.addTo(group).openPopup();
            this.segmentLayers.push(segment);
        }
        group.addTo(this.map!);
    }

    static async getLiveTracking() {
        return fetch(API_BASE + "/api/live-tracking")
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data && data.lat && data.lng) {
                    return { lat: data.lat, lng: data.lng };
                }
                return null;
            });
    }
}