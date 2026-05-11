import L from "leaflet";

let mapInstance: L.Map;
let mapContainerElement: HTMLElement;

export function getSharedMap() {
  if (!mapInstance) {
    // Create the persistent DOM element
    mapContainerElement = document.createElement("div");
    mapContainerElement.style.width = "100%";
    mapContainerElement.style.height = "100%";

    // Initialize the map on this element
    mapInstance = L.map(mapContainerElement).setView([59.8566, 10.5522], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(mapInstance);
  }

  return { map: mapInstance, container: mapContainerElement };
}
