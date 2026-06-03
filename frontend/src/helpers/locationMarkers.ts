import L from "leaflet";
import { authFetch } from "./auth";
import { API_BASE } from "./Constants";
import { LocationData } from "./mapData";
import { get, writable } from "svelte/store";

const defaultIcon = new L.Icon.Default();
const visitedIcon = new L.Icon({
    ...L.Icon.Default.prototype.options,
    iconUrl:
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const markers: Record<number, L.Marker> = {};

export const locations = writable<LocationData[]>([]);
export const visitedIds = writable<Set<number>>(new Set());

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

export async function saveAttraction(map: L.Map, name: string, lat: number, lng: number) {
    try {
        const res = await authFetch(API_BASE + "/api/locations/single", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, lat, lng }),
        });

        if (res.ok) {
            const data = await res.json();
            // Add to local state
            const newLoc = { id: data.id, name, lat, lng };
            locations.update((locs) => [...locs, newLoc]);

            // Render marker
            const marker = L.marker([lat, lng], { icon: defaultIcon })
                .addTo(map)
                .bindPopup(createPopupContent(newLoc, false));
            markers[newLoc.id] = marker;
            alert("Attraction saved to locations!");
        } else {
            alert("Failed to save attraction.");
        }
    } catch (err) {
        console.error("Error saving attraction:", err);
        alert("Error saving attraction.");
    }
}

export function updateMarkerPopup(loc: LocationData) {
    const marker = markers[loc.id];
    if (marker && marker.getPopup()) {
        marker.setPopupContent(createPopupContent(loc, get(visitedIds).has(loc.id)));
    }
}

export function getMarker(id: number) {
    return markers[id];
}

export function createPopupContent(loc: LocationData, isVisited: boolean, canSave?: boolean): string {
    return `
      <div style="text-align: center; min-width: 120px;">
        ${loc.imageUrl ? `<img src="${loc.imageUrl}" alt="${loc.name}" style="width:100%; max-height:100px; object-fit:cover; border-radius:4px; margin-bottom:5px;" /><br>` : ""}
        <strong>${loc.name}</strong><br>
        ${
            isVisited
                ? "<span style=\"color:#28a745;font-weight:bold;\">✓ Visited</span>"
                : canSave 
                    ? `<button style="margin-top:5px;padding:4px;cursor:pointer;" onclick="window.markVisited(${loc.id})">Mark as Visited</button>` 
                    : ""
        }
      </div>
    `;
}

export function renderLocations(map: L.Map, canSave?: boolean) {
    get(locations).forEach((loc) => {
        const isVisited = get(visitedIds).has(loc.id);
        const marker = L.marker([loc.lat, loc.lng], {
            icon: isVisited ? visitedIcon : defaultIcon,
        })
            .addTo(map)
            .bindPopup(createPopupContent(loc, isVisited, canSave));

        markers[loc.id] = marker;
    });
}
