import L from "leaflet";
import { authFetch } from "./auth";
import { API_BASE, defaultIcon, visitedIcon } from "./Constants";
import { LocationData } from "./mapData";
import { get, writable } from "svelte/store";
import { canSaveLocations } from "../stores/editStore";
import { getLayerControl } from "./sharedMap";

const markers: Record<number, L.Marker> = {};

export const locations = writable<LocationData[]>([]);
export const visitedIds = writable<Set<number>>(new Set());

let locationsLayerGroup: L.LayerGroup | null = null;
let locationsOverlayRegistered = false;

export async function markVisited(id: number) {
    try {
        await authFetch(API_BASE + "/api/visited", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });

        visitedIds.update(set => {
            set.add(id);
            return set;
        });

        const loc = get(locations).find((l) => l.id === id);
        const marker = markers[id];

        if (loc && marker) {
            marker.setIcon(visitedIcon);
            marker.setPopupContent(createPopupContent(loc, true));
        }
    } catch (err) {
        console.error("Error marking as visited:", err);
        alert("Failed to mark as visited.");
    }
};

export function updateMarkerPopup(loc: LocationData) {
    const marker = markers[loc.id];
    if (marker && marker.getPopup()) {
        marker.setPopupContent(createPopupContent(loc, get(visitedIds).has(loc.id)));
    }
}

export function getMarker(id: number) {
    return markers[id];
}

export function setMarker(id: number, marker: L.Marker) {
    markers[id] = marker;
}

export function createPopupContent(loc: LocationData, isVisited: boolean): string {
    return `
      <div style="text-align: center; min-width: 120px;">
        ${loc.imageUrl ? `<img src="${loc.imageUrl}" alt="${loc.name}" style="width:100%; max-height:100px; object-fit:cover; border-radius:4px; margin-bottom:5px;" /><br>` : ""}
        <strong>${loc.name}</strong><br>
        ${
            isVisited
                ? "<span style=\"color:#28a745;font-weight:bold;\">✓ Visited</span>"
                : get(canSaveLocations) 
                    ? `<button style="margin-top:5px;padding:4px;cursor:pointer;" onclick="window.markVisited(${loc.id})">Mark as Visited</button>` 
                    : ""
        }
      </div>
    `;
}

export function renderLocations(map: L.Map) {
    if (locationsLayerGroup && !map.hasLayer(locationsLayerGroup)) {
        return;
    }

    if (!locationsLayerGroup) {
        locationsLayerGroup = L.layerGroup();
    } else {
        locationsLayerGroup.clearLayers();
    }

    get(locations).forEach((loc) => {
        const isVisited = get(visitedIds).has(loc.id);
        const marker = L.marker([loc.lat, loc.lng], {
            icon: isVisited ? visitedIcon : defaultIcon,
        }).bindPopup(createPopupContent(loc, isVisited));
        
        marker.addTo(locationsLayerGroup!);
        setMarker(loc.id, marker);
    });

    if (!locationsLayerGroup.getLayers().length) return;

    if (!map.hasLayer(locationsLayerGroup)) {
        locationsLayerGroup.addTo(map);
    }

    const control = getLayerControl();
    if (!locationsOverlayRegistered) {
        control.addOverlay(locationsLayerGroup, "Saved Locations");
        locationsOverlayRegistered = true;

        map.on("overlayadd", (e: L.LayersControlEvent) => {
            if (e.layer === locationsLayerGroup) {
                renderLocations(map);
            }
        });
    }
}
