import L from "leaflet";
import { loadMapBootstrapData, type LocationData, PathPoint } from "./mapData";
import { API_BASE, visitedIcon } from "./Constants";
import { splitTripsByGap } from "./tripPath";
import { authFetch } from "./auth";
import { get } from "svelte/store";
import { isSpliceMode, locations, markers, spliceEndPt, spliceStartPt } from "../stores/editStore";
import { visitedIds } from "./locationMarkers";
import { gpsPath } from "../stores/tripStore";

export type LeafletWindow = Window & typeof globalThis & {
    editLocName?: (id: number, newName: string) => void;
    deleteLoc?: (id: number) => void;
    saveLocation?: (id: number) => void;
};

export class MapEditor {
    public map: L.Map;

    private pathLines: L.Polyline[] = [];
    public pathLayerGroup: L.FeatureGroup | undefined;
    private drawnGeomanShapes: L.Layer[] = [];

    // Timeline Splicing Cut Variables
    private fullPathData: PathPoint[] = [];
    private spliceMarkers: L.Marker[] = [];

    private defaultIcon = new L.Icon.Default();

    // Edit traces
    private selectedLine: L.Polyline | null = null;

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

        this.map.eachLayer((layer) => { 
            layer.options.pmIgnore = true;
        });

        this.map.on("pm:create", (e) => {
            if (e.shape === "Marker") {
                const newLoc: LocationData = {
                    id: get(locations).length,
                    name: "New Location",
                    lat: (e.layer as L.Marker).getLatLng().lat,
                    lng: (e.layer as L.Marker).getLatLng().lng,
                };

                this.map.removeLayer(e.layer);
                locations.update((locs) => [...locs, newLoc]);
                this.renderLocations();
            }
        });

        this.map.on("pm:remove", (e) => {
            this.drawnGeomanShapes = this.drawnGeomanShapes.filter(
                (layer) => layer !== e.layer,
            );
        });

        // Add map click listener
        this.map.on("click", (e) => {
            if (!get(isSpliceMode)) return;
            this.handleSpliceLocationSelection(e.latlng.lat, e.latlng.lng);
        });
    }

    editLocName(id: number, newName: string) {
        locations.update((locs) => {
            locs[id].name = newName;
            return locs;
        });
        this.renderLocations();
    };

    deleteLoc(id: number) {
        locations.update((locs) => {
            locs.splice(id, 1);
            return locs;
        });
        this.renderLocations();
    };

    handleSpliceLocationSelection(lat: number, lng: number) {
        if (!this.fullPathData || this.fullPathData.length === 0 || !get(isSpliceMode)) return;

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

        if (!get(spliceStartPt)) {
            spliceStartPt.set(closest);
        }
        else if (!get(spliceEndPt)) {
            spliceEndPt.set(closest);
        } else {
            spliceStartPt.set(closest);
            spliceEndPt.set(null);
        }
        
        this.renderSpliceMarkers();
    }

    renderSpliceMarkers() {
        this.spliceMarkers.forEach((m) => this.map.removeLayer(m));
        this.spliceMarkers = [];

        if (get(spliceStartPt)) {
            const m = L.marker([get(spliceStartPt)!.lat, get(spliceStartPt)!.lng])
                .addTo(this.map)
                .bindPopup(`Point A (ID: ${get(spliceStartPt)!.id})`)
                .openPopup();
            this.spliceMarkers.push(m);
        }
        if (get(spliceEndPt)) {
            const m = L.marker([get(spliceEndPt)!.lat, get(spliceEndPt)!.lng])
                .addTo(this.map)
                .bindPopup(`Point B (ID: ${get(spliceEndPt)!.id})`)
                .openPopup();
            this.spliceMarkers.push(m);
        }
    }

    toggleSpliceMode() {
        isSpliceMode.update(v => !v);
        if (!get(isSpliceMode)) {
            // Clean up
            spliceStartPt.set(null);
            spliceEndPt.set(null);
            this.renderSpliceMarkers();
        } else {
            //Give UI notification indicating it has started
            alert(
                "Splice Mode ON: Click first valid vertex (A), then second valid vertex (B).",
            );
        }
    }

    async executeSplice(currentBounds?: L.LatLngBounds) {
        if (!get(spliceStartPt) || !get(spliceEndPt)) return;

        if (
            !confirm(
                `Delete all points between Point A (${get(spliceStartPt)!.id}) and Point B (${get(spliceEndPt)!.id})?`,
            )
        )
            return;

        try {
            const res = await authFetch(API_BASE + "/api/path/splice", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    startId: get(spliceStartPt)!.id,
                    endId: get(spliceEndPt)!.id,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                alert(`SPLICED! Removed ${data.removed} points.`);
                this.toggleSpliceMode();
                // Refresh the path visual
                await this.loadPath();
                await this.loadData();
                if (currentBounds) {
                    this.map.fitBounds(currentBounds);
                }
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

        const pts = data.map((d: { lat: number; lng: number; }) => [d.lat, d.lng] as [number, number]);
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
        locations.set(await res.json());
        this.renderLocations();

        const markersVal = get(markers);
        if (markersVal && markersVal.length > 0) {
            const group: L.FeatureGroup = new L.featureGroup(markersVal);
            this.map.fitBounds(group.getBounds());
        }
    }

    async loadData() {
        try {
            const data = await loadMapBootstrapData();
            locations.set(data.locations);
            this.renderLocations();
            this.renderPaths(data.pathData);

            const markersVal = get(markers);
            if (markersVal && markersVal.length > 0) {
                const group: L.FeatureGroup = new L.featureGroup(markersVal);
                this.map.fitBounds(group.getBounds());
            }
        } catch (e) {
            console.error("Failed to load map data", e);
        }
    }

    renderLocations() {
        get(markers)?.forEach((m) => this.map.removeLayer(m));
        markers.update(() => []);

        get(locations).forEach((loc, index) => {
            const isVisited = get(visitedIds).has(loc.id);
            const marker = L.marker([loc.lat, loc.lng], {
                draggable: true,
                icon: isVisited ? visitedIcon : this.defaultIcon,
            }).addTo(this.map);

            marker.on("dragend", (e) => {
                const pos = e.target.getLatLng();
                locations.update((locs) => {
                    locs[index].lat = pos.lat;
                    locs[index].lng = pos.lng;
                    return locs;
                });
            });

            marker.bindPopup(`
        <div style="min-width:150px">
            <strong>Edit Name:</strong><br>
            <input type="text" value="${loc.name.replace(/"/g, "&quot;")}" onchange="window.editLocName(${index}, this.value)" style="width:100%;margin:5px 0" />
            <button 
                onclick="window.deleteLoc(${index})" 
                class="btn"
                style="background-color:red;color:white;border:none;padding:4px;cursor:pointer;width:100%;margin-top:0.25rem">
                Delete Location
            </button>
            <button
                onclick="window.saveLocation(${index})"                 
                class="btn"
                style="background:green;color:white;border:none;padding:4px;cursor:pointer;width:100%;margin-top:0.25rem">
                Save Location
            </button>  
        </div>
      `);

            markers.update((prev) => [...prev, marker]);
        });
    }

    renderPaths(pathData: PathPoint[]) {
        this.pathLayerGroup?.clearLayers();
        if (!this.pathLayerGroup) return;

        const trips = splitTripsByGap(pathData);
        trips.forEach((trip) => {
            const simplified = this.simplifyTrip(trip, 5);
            if (simplified.length < 2) return;
            const latlngs = simplified.map((p) => [p.lat, p.lng] as L.LatLngTuple);
            const polyline = L.polyline(latlngs, {
                color: "blue",
                weight: 5,
                pmIgnore: true,
            });

            polyline.on("click", () => {
                // Deselect whatever was previously active
                if (this.selectedLine && this.selectedLine !== polyline) {
                    (this.selectedLine as any).pm.disable();
                    this.selectedLine.setStyle({ color: "blue", weight: 5, dashArray: undefined });
                    this.selectedLine.options.pmIgnore = true;
                    L.PM.reInitLayer(this.selectedLine);
                }

                this.map.fitBounds(polyline.getBounds());

                // Opt this specific layer in
                polyline.options.pmIgnore = false;
                L.PM.reInitLayer(polyline);
                polyline.pm.enable({ hideMiddleMarkers: true, snappable: true });
                polyline.setStyle({ color: "yellow", weight: 8, dashArray: "4 6" });

                this.selectedLine = polyline;

                this.map.pm.addControls({
                    cutPolygon: true,
                    dragMode: true,
                    drawCircle: false,
                    drawCircleMarker: false,
                    drawMarker: true,
                    drawPolygon: true,
                    drawPolyline: false,
                    drawRectangle: true,
                    editControls: true,
                    editMode: true,
                    position: "topleft",
                    removalMode: true,
                    rotateMode: false,
                });
            });

            // Attach the original timestamps to the layer so we can potentially save them back
            (polyline as any)._originalPoints = simplified;
            if (this.pathLayerGroup) {
                polyline.addTo(this.pathLayerGroup);
                this.pathLayerGroup.options.pmIgnore = false;
            }
        });
    }

    simplifyTrip(trip: PathPoint[], toleranceMeters: number): PathPoint[] {
        if (trip.length < 3) return trip;
        const res = [trip[0]];
        let last = trip[0];

        for (let i = 1; i < trip.length - 1; i++) {
            const pt = trip[i];

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
                    get(locations).map((l) => ({ name: l.name, lat: l.lat, lng: l.lng })),
                ),
            });
            if (res.ok) alert("Successfully saved locations!");
            else alert("Failed to save locations.");
        } catch (e) {
            alert("Error saving locations.");
            console.error(e);
        }
    }

    async saveLocation(ld: LocationData) {
        try {
            const res = await authFetch(API_BASE + "/api/locations/single", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: ld.name, lat: ld.lat, lng: ld.lng }),
            });

            if (res.ok) {
                const data = await res.json();
                // Add to local state
                const newLoc = { id: data.id, name: ld.name, lat: ld.lat, lng: ld.lng };
                locations.update((locs) => [...locs, newLoc]);
                this.renderLocations();
                alert("New location saved!");
            } else {
                alert("Failed to save location.");
            }
            
        } catch (e) {
            alert("Error saving location.");
            console.error(e);
        }
    }

    async saveTraces() {
        if (!this.pathLayerGroup) return;

        const originalPoints = get(gpsPath); 
        const MATCH_THRESHOLD_METERS = 10;
        const usedTimestamps = new Set<string>();
        const newPathData: PathPoint[] = [];

        this.pathLayerGroup.eachLayer((layer: L.Layer) => {
            if (!(layer instanceof L.Polyline)) return;

            const flatten = (arr: any[]): L.LatLng[] =>
                !arr?.length ? [] : Array.isArray(arr[0]) ? arr.flatMap(flatten) : arr;

            const flatLatLngs = flatten(layer.getLatLngs());

            flatLatLngs.forEach((ll: L.LatLng) => {
                const { best, bestDist } = this.findClosest(ll.lat, ll.lng, originalPoints, this.map);

                if (best?.timestamp && bestDist < MATCH_THRESHOLD_METERS) {
                    if (usedTimestamps.has(best.timestamp)) return; 
                    usedTimestamps.add(best.timestamp);
                    newPathData.push({ lat: ll.lat, lng: ll.lng, timestamp: best.timestamp });
                } else {
                    newPathData.push({ lat: ll.lat, lng: ll.lng });
                }
            });
        });

        // Interpolate timestamps points using neighbors
        for (let i = 0; i < newPathData.length; i++) {
            if (newPathData[i].timestamp) continue;

            let prevIdx = i - 1;
            while (prevIdx >= 0 && !newPathData[prevIdx].timestamp) prevIdx--;
            let nextIdx = i + 1;
            while (nextIdx < newPathData.length && !newPathData[nextIdx].timestamp) nextIdx++;

            const prev = newPathData[prevIdx];
            const next = newPathData[nextIdx];

            if (prev.timestamp && next.timestamp) {
                const span = nextIdx - prevIdx;
                const frac = (i - prevIdx) / span;
                const prevTime = new Date(prev.timestamp).getTime();
                const nextTime = new Date(next.timestamp).getTime();
                newPathData[i].timestamp = new Date(prevTime + (nextTime - prevTime) * frac).toISOString();
            } else if (prev.timestamp) {
                newPathData[i].timestamp = new Date(new Date(prev.timestamp).getTime() + 1000).toISOString();
            } else if (next.timestamp) {
                newPathData[i].timestamp = new Date(new Date(next.timestamp).getTime() - 1000).toISOString();
            } else {
                newPathData[i].timestamp = new Date().toISOString();
            }
        }

        try {
            const res = await authFetch(API_BASE + "/api/path", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newPathData),
            });

            if (res.ok) {
                alert("Successfully saved traces!");
                gpsPath.set(newPathData); // keep local store consistent with what's now saved
            } else {
                alert("Failed to save traces.");
            }
        } catch (e) {
            alert("Error saving traces.");
            console.error(e);
        }
    }

    private findClosest(lat: number, lng: number, candidates: PathPoint[], map: L.Map) {
        let best: PathPoint | null = null;
        let bestDist = Infinity;
        for (const c of candidates) {
            const d = map.distance([lat, lng], [c.lat, c.lng]);
            if (d < bestDist) {
                bestDist = d;
                best = c;
            }
        }
        return { best, bestDist };
    }
}
