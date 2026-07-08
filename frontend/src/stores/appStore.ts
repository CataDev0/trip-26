import L from "leaflet";
import { writable } from "svelte/store";

export const isLiveTracking = writable<boolean>(false);
// Holds all livetracking related layers
export const liveTrackingLayer = writable<L.LayerGroup>(L.layerGroup());
// Holds the raw route coordinates for progress calculations
export const routeCoords = writable<L.LatLng[]>([]);