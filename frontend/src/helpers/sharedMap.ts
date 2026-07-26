import L from "leaflet";
import "leaflet-rotate";
import { renderPath } from "./tripPath";
import { lastSimplifiedZoomBucket } from "../stores/appStore";
import { get } from "svelte/store";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

let mapInstance: L.Map;
let mapContainerElement: HTMLDivElement;
let sharedLayerControl: L.Control.Layers;

L.PM.setOptIn(true); 

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
            touchRotate: true,
            pmIgnore: false, 
        })
            .setView([59.8566, 10.5522], 9);
        
        const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap",
        });
        const osmCyclo = L.tileLayer("https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; CyclOSM",
        });

        mapInstance.addLayer(osm);

        const baseMaps = {
            "OpenStreetMap": osm,
            "Cycle Map (CyclOSM)": osmCyclo
        };

        sharedLayerControl = L.control.layers(baseMaps).addTo(mapInstance);
    }

    return { map: mapInstance, container: mapContainerElement };
}

export function getLayerControl(): L.Control.Layers {
    return sharedLayerControl;
}

export function getZoomBucket(zoom: number): number {
    return Math.floor(zoom / 2);
}

export function reRenderPathBasedOnZoom(map: L.Map) {
    const bucket = getZoomBucket(map.getZoom());
    if (bucket === get(lastSimplifiedZoomBucket)) return;
    lastSimplifiedZoomBucket.set(bucket);

    renderPath(map)
}
