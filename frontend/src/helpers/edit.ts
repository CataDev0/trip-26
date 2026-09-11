import L from "leaflet";
import { loadMapBootstrapData, type LocationData, PathPoint } from "./mapData";
import { API_BASE, visitedIcon } from "./Constants";
import { splitTripsByGap } from "./tripPath";
import { authFetch } from "./auth";
import { get } from "svelte/store";
import { isSpliceMode, locations, markers, spliceEndPt, spliceStartPt } from "../stores/editStore";
import { visitedIds } from "./locationMarkers";
import { gpsPath } from "../stores/tripStore";

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

        // Named handlers so dispose() can remove them from the shared map
        this.map.on("pm:create", this.onPmCreate);
        this.map.on("pm:remove", this.onPmRemove);

        // Add map click listener
        this.map.on("click", this.onMapClick);
    }

    private onPmCreate = (e: L.LeafletEvent) => {
        if ((e as { shape?: string }).shape === "Marker") {
            // New locations get no id — the server generates one on save
            const newLoc = {
                name: "New Location",
                lat: ((e as { layer?: L.Marker }).layer as L.Marker).getLatLng().lat,
                lng: ((e as { layer?: L.Marker }).layer as L.Marker).getLatLng().lng,
            } as LocationData;

            this.map.removeLayer((e as { layer?: L.Marker }).layer as L.Marker);
            locations.update((locs) => [...locs, newLoc]);
            this.renderLocations();
        }
    };

    private onPmRemove = (e: L.LeafletEvent) => {
        this.drawnGeomanShapes = this.drawnGeomanShapes.filter(
            (layer) => layer !== e.layer,
        );
    };

    private onMapClick = (e: L.LeafletMouseEvent) => {
        if (!get(isSpliceMode)) return;
        this.handleSpliceLocationSelection(e.latlng.lat, e.latlng.lng);
    };

    // Remove listeners and Geoman controls registered on the shared map
    // (the map persists across view navigation, so cleanup is mandatory)
    dispose() {
        this.map.off("pm:create", this.onPmCreate);
        this.map.off("pm:remove", this.onPmRemove);
        this.map.off("click", this.onMapClick);

        this.spliceMarkers.forEach((m) => this.map.removeLayer(m));
        this.spliceMarkers = [];

        this.map.eachLayer((layer) => {
            layer.options.pmIgnore = true;
        });
        this.map.pm.removeControls();
        this.map.pm.disableDraw();

        if (this.pathLayerGroup) {
            this.map.removeLayer(this.pathLayerGroup);
        }
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
        const startPt = get(spliceStartPt);
        const endPt = get(spliceEndPt);
        if (!startPt || !endPt) return;

        if (startPt.trip_id === undefined || startPt.trip_id === null) {
            alert("Could not determine the trip of the selected points.");
            return;
        }
        if (endPt.trip_id !== undefined && endPt.trip_id !== null && startPt.trip_id !== endPt.trip_id) {
            alert("Point A and Point B are in different trips. Select both points within the same trip.");
            return;
        }

        if (
            !confirm(
                `Delete all points between Point A (${startPt.id}) and Point B (${endPt.id})?`,
            )
        )
            return;

        try {
            const res = await authFetch(API_BASE + "/api/path/splice", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    startId: startPt.id,
                    endId: endPt.id,
                    tripId: startPt.trip_id,
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
            const group: L.FeatureGroup = L.featureGroup(markersVal);
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
                const group: L.FeatureGroup = L.featureGroup(markersVal);
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

            // Build popup with DOM APIs — names are user input, never interpolate
            // them into HTML strings
            const popup = document.createElement("div");
            popup.style.minWidth = "150px";

            const label = document.createElement("strong");
            label.textContent = "Edit Name:";
            popup.appendChild(label);
            popup.appendChild(document.createElement("br"));

            const input = document.createElement("input");
            input.type = "text";
            input.value = loc.name;
            input.style.width = "100%";
            input.style.margin = "5px 0";
            input.addEventListener("change", () => {
                this.editLocName(index, input.value);
            });
            popup.appendChild(input);

            const deleteButton = document.createElement("button");
            deleteButton.className = "btn";
            deleteButton.style.backgroundColor = "red";
            deleteButton.style.color = "white";
            deleteButton.style.border = "none";
            deleteButton.style.padding = "4px";
            deleteButton.style.cursor = "pointer";
            deleteButton.style.width = "100%";
            deleteButton.style.marginTop = "0.25rem";
            deleteButton.textContent = "Delete Location";
            deleteButton.addEventListener("click", () => {
                this.deleteLoc(index);
            });
            popup.appendChild(deleteButton);

            const saveButton = document.createElement("button");
            saveButton.className = "btn";
            saveButton.style.background = "green";
            saveButton.style.color = "white";
            saveButton.style.border = "none";
            saveButton.style.padding = "4px";
            saveButton.style.cursor = "pointer";
            saveButton.style.width = "100%";
            saveButton.style.marginTop = "0.25rem";
            saveButton.textContent = "Save Location";
            saveButton.addEventListener("click", () => {
                this.saveLocation(get(locations)[index]);
            });
            popup.appendChild(saveButton);

            marker.bindPopup(popup);

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
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- geoman attaches pm at runtime
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Leaflet layers carry arbitrary metadata
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
                    // Send existing ids so the server upserts instead of
                    // regenerating them (which would orphan visited marks)
                    get(locations).map((l) => ({
                        id: l.id,
                        name: l.name,
                        lat: l.lat,
                        lng: l.lng,
                        trip_id: l.trip_id ?? null,
                    })),
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
                body: JSON.stringify({
                    id: ld.id,
                    name: ld.name,
                    lat: ld.lat,
                    lng: ld.lng,
                    trip_id: ld.trip_id ?? null,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                if (ld.id === undefined) {
                    // New location — add it to local state with the server-issued id
                    const newLoc = {
                        id: Number(data.id),
                        name: ld.name,
                        lat: ld.lat,
                        lng: ld.lng,
                        trip_id: ld.trip_id ?? null,
                    };
                    locations.update((locs) => [...locs, newLoc]);
                    this.renderLocations();
                    alert("New location saved!");
                } else {
                    alert("Location saved!");
                }
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

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- getLatLngs returns nested arrays of varying depth
            const flatten = (arr: any[]): L.LatLng[] =>
                !arr?.length ? [] : Array.isArray(arr[0]) ? arr.flatMap(flatten) : arr;

            const flatLatLngs = flatten(layer.getLatLngs());

            flatLatLngs.forEach((ll: L.LatLng) => {
                const { best, bestDist } = this.findClosest(ll.lat, ll.lng, originalPoints, this.map);

                if (best?.timestamp && bestDist < MATCH_THRESHOLD_METERS) {
                    if (usedTimestamps.has(best.timestamp)) return;
                    usedTimestamps.add(best.timestamp);
                    newPathData.push({
                        lat: ll.lat,
                        lng: ll.lng,
                        timestamp: best.timestamp,
                        // Preserve the trip association and speed so saving
                        // edited traces does not orphan every point
                        trip_id: best.trip_id,
                        current_speed: best.current_speed,
                    });
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

        // New and interpolated points inherit the trip_id of the nearest
        // neighbor that has one, so drawn-in segments stay in their trip
        let lastTripId: number | null = null;
        for (const pt of newPathData) {
            if (pt.trip_id !== undefined && pt.trip_id !== null) {
                lastTripId = pt.trip_id;
            } else if (lastTripId !== null) {
                pt.trip_id = lastTripId;
            }
        }
        lastTripId = null;
        for (let i = newPathData.length - 1; i >= 0; i--) {
            const pt = newPathData[i];
            if (pt.trip_id !== undefined && pt.trip_id !== null) {
                lastTripId = pt.trip_id;
            } else if (lastTripId !== null) {
                pt.trip_id = lastTripId;
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
