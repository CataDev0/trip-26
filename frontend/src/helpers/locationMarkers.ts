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

export async function unmarkVisited(id: number) {
    try {
        await authFetch(API_BASE + `/api/visited/${id}`, {
            method: "DELETE",
        });

        visitedIds.update(set => {
            const next = new Set(set);
            next.delete(id);
            return next;
        });

        const loc = get(locations).find((l) => l.id === id);
        const marker = markers[id];

        if (loc && marker) {
            marker.setIcon(defaultIcon);
            marker.setPopupContent(createPopupContent(loc, false));
        }
    } catch (err) {
        console.error("Error reverting visited status:", err);
        alert("Failed to revert visited status.");
    }
};

// Associate a location with a trip (tripId: null removes the association)
export async function setLocationTrip(id: number, tripId: number | null) {
    try {
        await authFetch(API_BASE + `/api/locations/${id}/trip`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tripId }),
        });

        locations.update((locs) =>
            locs.map((l) => (l.id === id ? { ...l, trip_id: tripId } : l)),
        );
    } catch (err) {
        console.error("Error associating location with trip:", err);
        alert("Failed to associate location with trip.");
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

// Builds popup content with DOM APIs only — names come from user input and
// external sources, so they must never be interpolated into HTML strings
export function createPopupContent(loc: LocationData, isVisited: boolean): HTMLElement {
    const container = document.createElement("div");
    container.style.textAlign = "center";
    container.style.minWidth = "120px";

    if (loc.imageUrl) {
        const img = document.createElement("img");
        img.src = loc.imageUrl;
        img.alt = loc.name;
        img.style.width = "100%";
        img.style.maxHeight = "100px";
        img.style.objectFit = "cover";
        img.style.borderRadius = "4px";
        img.style.marginBottom = "5px";
        container.appendChild(img);
        container.appendChild(document.createElement("br"));
    }

    const nameEl = document.createElement("strong");
    nameEl.textContent = loc.name;
    container.appendChild(nameEl);
    container.appendChild(document.createElement("br"));

    if (isVisited) {
        const visited = document.createElement("span");
        visited.style.color = "#28a745";
        visited.style.fontWeight = "bold";
        visited.textContent = "✓ Visited";
        container.appendChild(visited);
    } else if (get(canSaveLocations)) {
        const button = document.createElement("button");
        button.style.marginTop = "5px";
        button.style.padding = "4px";
        button.style.cursor = "pointer";
        button.textContent = "Mark as Visited";
        button.addEventListener("click", () => {
            markVisited(loc.id);
        });
        container.appendChild(button);
    }

    return container;
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
