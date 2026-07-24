import L from "leaflet";

export const MIN_ATTRACTIONS_ZOOM = 13;
export const API_BASE = import.meta.env.VITE_API_BASE || "";
// 1 minute
export const VISITOR_COUNT_REFRESH_INTERVAL = 1 * 60 * 1000; 

export const defaultIcon = new L.Icon.Default();
export const visitedIcon = new L.Icon({
    iconUrl: "/icons/marker-icon-2x-green.png",
    shadowUrl: "/icons/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

export const CHUNKS_PER_TRIP = 4;