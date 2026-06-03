import L, { FeatureGroup } from "leaflet";
import { loadMapBootstrapData, LocationData, PathPoint } from "./mapData";
import { API_BASE } from "./Constants";
import { splitTripsByGap } from "./tripPath";
import { authFetch } from "./auth";
import { get, Writable, writable } from "svelte/store";

export class MapEditor {
    public map: L.Map;
    public locations: LocationData[] = [];

    private pathLines: L.Polyline[] = [];
    private markers: L.Layer[] = [];
    public pathLayerGroup: FeatureGroup | undefined;
    private drawnGeomanShapes: L.Layer[] = [];

    // Timeline Splicing Cut Variables
    private fullPathData: PathPoint[] = [];
    public isSpliceMode = writable(false);
    public spliceStartPt: Writable<PathPoint | null> = writable(null);
    public spliceEndPt: Writable<PathPoint | null> = writable(null);
    private spliceMarkers: L.Marker[] = [];

    private defaultIcon = new L.Icon.Default();

    constructor(map: L.Map) {
        this.map = map;

        setTimeout(() => {
            this.map.invalidateSize();
        }, 10);

        this.loadLocations()
            .then(async () => {
                await this.loadPath();
                this.pathLayerGroup = L.featureGroup().addTo(this.map);
            }).then(() => {
                this.loadData();
            });

        // Global hooks inside popup HTML snippets
        (window as any).editLocName = (id: number, newName: string) => {
            this.locations[id].name = newName;
        };

        (window as any).deleteLoc = (id: number) => {
            this.locations.splice(id, 1);
            this.locations = [...this.locations];
            this.renderLocations();
        };

        this.map.on("pm:create", (e) => {
            if (e.type === "Marker") {
                const ll = (e.layer as L.Marker).getLatLng();
                const newLoc: LocationData = {
                    id: this.locations.length,
                    name: "New Location",
                    lat: ll.lat,
                    lng: ll.lng,
                };
                this.locations = [...this.locations, newLoc];
                this.renderLocations();
                this.map.removeLayer(e.layer);
            }
        });

        this.map.on("pm:remove", (e) => {
            this.drawnGeomanShapes = this.drawnGeomanShapes.filter(
                (layer) => layer !== e.layer,
            );
        });

        // Add map click listener
        this.map.on("click", (e) => {
            if (!get(this.isSpliceMode)) return;
            this.handleSpliceLocationSelection(e.latlng.lat, e.latlng.lng);
        });

        (() => {
            delete (window as any).editLocName;
            delete (window as any).deleteLoc;
            if (this.map) {
                this.map.off("pm:create");
                this.map.off("pm:remove");
                this.map.pm.removeControls();
                this.map.pm.disableDraw();
                if (this.pathLayerGroup) this.map.removeLayer(this.pathLayerGroup);
            }
        })();
    }

    handleSpliceLocationSelection(lat: number, lng: number) {
        if (!this.fullPathData || this.fullPathData.length === 0 || !get(this.isSpliceMode)) return;

        // Find closest valid vertex to the mouse-click
        let closest = this.fullPathData[0];
        let minDist = Number.MAX_VALUE;

        for (const pt of this.fullPathData) {
            const dlat = pt.lat - lat;
            const dlng = pt.lng - lng;
            const dist = dlat * dlat + dlng * dlng;
            if (dist < minDist) {
                minDist = dist;
                closest = pt;
            }
        }

        if (!get(this.spliceStartPt)) {
            this.spliceStartPt.set(closest);
        }
        else if (!get(this.spliceEndPt)) {
            this.spliceEndPt.set(closest);
        } else {
            this.spliceStartPt.set(closest);
            this.spliceEndPt.set(null);
        }
        
        this.renderSpliceMarkers();
    }

    renderSpliceMarkers() {
        this.spliceMarkers.forEach((m) => this.map.removeLayer(m));
        this.spliceMarkers = [];

        if (get(this.spliceStartPt)) {
            const m = L.marker([get(this.spliceStartPt)!.lat, get(this.spliceStartPt)!.lng])
                .addTo(this.map)
                .bindPopup(`Point A (ID: ${get(this.spliceStartPt)!.id})`)
                .openPopup();
            this.spliceMarkers.push(m);
        }
        if (get(this.spliceEndPt)) {
            const m = L.marker([get(this.spliceEndPt)!.lat, get(this.spliceEndPt)!.lng])
                .addTo(this.map)
                .bindPopup(`Point B (ID: ${get(this.spliceEndPt)!.id})`)
                .openPopup();
            this.spliceMarkers.push(m);
        }
    }

    toggleSpliceMode() {
        this.isSpliceMode.update(v => !v);
        if (!get(this.isSpliceMode)) {
            // Clean up
            this.spliceStartPt.set(null);
            this.spliceEndPt.set(null);
            this.renderSpliceMarkers();
        } else {
            //Give UI notification indicating it has started
            alert(
                "Splice Mode ON: Click first valid vertex (A), then second valid vertex (B).",
            );
        }
    }

    async executeSplice() {
        if (!get(this.spliceStartPt) || !get(this.spliceEndPt)) return;

        if (
            !confirm(
                `Delete all points between Point A (${get(this.spliceStartPt)!.id}) and Point B (${get(this.spliceEndPt)!.id})?`,
            )
        )
            return;

        try {
            const res = await authFetch(API_BASE + "/api/path/splice", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    startId: get(this.spliceStartPt)!.id,
                    endId: get(this.spliceEndPt)!.id,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                alert(`SPLICED! Removed ${data.removed} points.`);
                this.toggleSpliceMode();
                // Refresh the path visual
                await this.loadPath();
                await this.loadData();
            } else {
                alert("Failed to splice path.");
            }
        } catch (e) {
            alert("Error splicing path.");
            console.error(e);
        }
    }

    async loadPath() {
        const res = await fetch(API_BASE + "/api/path");
        const data = await res.json();

        // Keep a reference to the actual IDs and sequences
        this.fullPathData = data;

        const pts = data.map((d: any) => [d.lat, d.lng] as [number, number]);
        if (pts.length > 0) {
            if (this.pathLines.length) {
                this.pathLines.forEach((l) => this.map.removeLayer(l));
                this.pathLines = [];
            }
            this.pathLines.push(
                L.polyline(pts, { color: "blue", weight: 3, opacity: 0.5 }).addTo(
                    this.map,
                ),
            );
        }
    }
    async loadLocations() {
        const res = await fetch(API_BASE + "/api/locations");
        this.locations = await res.json();
        this.renderLocations();

        if (this.markers && this.markers.length > 0) {
            const group: L.FeatureGroup = new L.featureGroup(this.markers);
            this.map.fitBounds(group.getBounds());
        }
    }

    async loadData() {
        try {
            const data = await loadMapBootstrapData();
            this.locations = data.locations;
            this.renderLocations();
            this.renderPaths(data.pathData);

            if (this.markers && this.markers.length > 0) {
                const group: L.FeatureGroup = new L.featureGroup(this.markers);
                this.map.fitBounds(group.getBounds());
            }
        } catch (e) {
            console.error("Failed to load map data", e);
        }
    }

    renderLocations() {
        this.markers?.forEach((m) => this.map.removeLayer(m));
        this.markers = [];

        this.locations.forEach((loc, index) => {
            const marker = L.marker([loc.lat, loc.lng], {
                draggable: true,
                icon: this.defaultIcon,
            }).addTo(this.map);

            marker.on("dragend", (e) => {
                const pos = e.target.getLatLng();
                this.locations[index].lat = pos.lat;
                this.locations[index].lng = pos.lng;
            });

            marker.bindPopup(`
        <div style="min-width:150px">
          <strong>Edit Name:</strong><br>
          <input type="text" value="${loc.name.replace(/"/g, "&quot;")}" onchange="window.editLocName(${index}, this.value)" style="width:100%;margin:5px 0" />
          <br>
          <button onclick="window.deleteLoc(${index})" style="background:red;color:white;border:none;padding:4px;cursor:pointer;width:100%">Delete Location</button>
        </div>
      `);

            this.markers?.push(marker);
        });
    }

    renderPaths(pathData: PathPoint[]) {
        this.pathLayerGroup?.clearLayers();
        if (!this.pathLayerGroup) return;

        const trips = splitTripsByGap(pathData);
        trips.forEach((trip) => {
            // 5 meter tolerance removes redundant jitter vertices
            const simplified = this.simplifyTrip(trip, 5);
            if (simplified.length < 2) return;
            const latlngs = simplified.map((p) => [p.lat, p.lng] as L.LatLngTuple);
            const polyline = L.polyline(latlngs, {
                color: "blue",
                weight: 5,
                pmIgnore: false,
            });
            // Attach the original timestamps to the layer so we can potentially save them back
            (polyline as any)._originalPoints = simplified;
            if (this.pathLayerGroup) polyline.addTo(this.pathLayerGroup);
        });
    }

    simplifyTrip(trip: PathPoint[], toleranceMeters: number): PathPoint[] {
        if (trip.length < 3) return trip;
        const res = [trip[0]];
        let last = trip[0];

        for (let i = 1; i < trip.length - 1; i++) {
            const pt = trip[i];
            // Basic distance drop: if current point is within <toleranceMeters> of the last retained point, skip it
            const dist = this.map.distance([last.lat, last.lng], [pt.lat, pt.lng]);
            if (dist > toleranceMeters) {
                res.push(pt);
                last = pt;
            }
        }
        res.push(trip[trip.length - 1]);
        return res;
    }

    async saveLocations() {
        try {
            const res = await authFetch(API_BASE + "/api/locations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    this.locations.map((l) => ({ name: l.name, lat: l.lat, lng: l.lng })),
                ),
            });
            if (res.ok) alert("Successfully saved locations!");
            else alert("Failed to save locations.");
        } catch (e) {
            alert("Error saving locations.");
            console.error(e);
        }
    }

    async saveTraces() {
        if (!this.pathLayerGroup) return;

        const newPathData: PathPoint[] = [];
        let baseTime = new Date("2020-01-01T00:00:00Z").getTime();

        this.pathLayerGroup.eachLayer((layer: L.Layer) => {
            if (layer instanceof L.Polyline) {
                const latlngs = layer.getLatLngs();
                const flatten = (arr: L.LatLng[] | L.LatLng[][] | L.LatLng[][][]): L.LatLng[] => {
                    if (!arr || arr.length === 0) return [];
                    if (Array.isArray(arr[0])) {
                        return arr.flatMap(flatten as any);
                    }
                    return arr as L.LatLng[];
                };

                const flatLatLngs = flatten(latlngs);

                flatLatLngs.forEach((ll, index) => {
                    newPathData.push({
                        lat: ll.lat,
                        lng: ll.lng,
                        timestamp: new Date(baseTime + index * 1000).toISOString(),
                    });
                });

                // Jump 1 hour so the next polyline counts as a separate trip
                baseTime += flatLatLngs.length * 1000 + 3600000;
            }
        });

        try {
            const res = await authFetch(API_BASE + "/api/path", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newPathData),
            });
            if (res.ok) alert("Successfully saved traces!");
            else alert("Failed to save traces.");
        } catch (e) {
            alert("Error saving traces.");
            console.error(e);
        }
    }
}
