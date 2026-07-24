import L from "leaflet";
import "leaflet-rotate";
import { renderPath } from "./tripPath";
import { lastSimplifiedZoomBucket } from "../stores/appStore";
import { get } from "svelte/store";

let mapInstance: L.Map;
let mapContainerElement: HTMLDivElement;

export function getSharedMap() {
    if (!mapInstance) {
    // Create the persistent DOM element
        mapContainerElement = document.createElement("div");
        mapContainerElement.style.width = "100%";
        mapContainerElement.style.height = "100%";

        // Initialize the map on this element
        mapInstance = L.map(mapContainerElement, { 
            rotate: true, 
            rotateControl: { closeOnZeroBearing: false},
            touchRotate: true
        })
            .setView([59.8566, 10.5522], 9);
        
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap",
        }).addTo(mapInstance);
    }

    return { map: mapInstance, container: mapContainerElement };
}

export function getZoomBucket(zoom: number): number {
    return Math.floor(zoom / 2);
}

export function reRenderPathBasedOnZoom(map) {
    const bucket = getZoomBucket(map.getZoom());
    if (bucket === get(lastSimplifiedZoomBucket)) return;
    lastSimplifiedZoomBucket.set(bucket);

    renderPath(map)
}
