import L from "leaflet";
import { AttractionData } from "../typed/Typed";
import { authFetch } from "./auth";
import { API_BASE } from "./Constants";
import { locations, createPopupContent, setMarker } from "./locationMarkers";

const defaultIcon = new L.Icon.Default();

// Only allow http(s) URLs from external data — everything else is unsafe
// (javascript: schemes, attribute breakouts, etc.)
function safeHttpUrl(value: string): string | null {
    return /^https?:\/\//i.test(value) ? value : null;
}

/**
 * Fetches nearby attractions using Overpass API and renders them on the map.
 * @param map The Leaflet map instance to get bounds from and add markers to.
 * @param canSave Whether to render a "Save to Locations" button in the popup.
 */
export async function fetchAndRenderAttractions(
    map: L.Map,
    canSave: boolean,
): Promise<void> {
    const bounds = map.getBounds();
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
    const query = `[out:json][timeout:25];(node["tourism"="museum"](${bbox});node["historic"](${bbox});node["tourism"="attraction"](${bbox}););out;`;

    const url = new URL("https://overpass-api.de/api/interpreter");
    url.searchParams.set("data", query);

    let res;
    for (let i = 0; i < 3; i++) {
        res = await fetch(url);
        if (res.ok) break;
        // Retry on 504 (Gateway Timeout) or 429 (Too Many Requests)
        if (res.status === 504 || res.status === 429) {
            console.warn(
                `Overpass API error ${res.status}, retrying in ${1.5 * (i + 1)}s...`,
            );
            await new Promise((resolve) => setTimeout(resolve, 1500 * (i + 1)));
        } else {
            break;
        }
    }

    if (!res || !res.ok) {
        console.error(
            "Failed to fetch attractions:",
            res?.statusText || "Max retries reached",
        );
        return;
    }

    const data = await res.json();

    data.elements.forEach((el: AttractionData) => {
        if (el.lat && el.lon && el.tags) {
            let type = el.tags.tourism || el.tags.historic || el.tags.amenity;

            // Better classification handling for generic or composite tags
            if (type === "yes") type = "Historic Site";
            else if (type === "memorial" && el.tags.memorial)
                type = `${el.tags.memorial} Memorial`;

            const formattedType = type
                ? type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
                : "Attraction";
            const name = el.tags["name:en"] || el.tags.name || formattedType;

            // Build popup with DOM APIs only — Overpass/OSM tags are external data
            // and must never be interpolated into HTML strings
            const container = document.createElement("div");
            container.style.textAlign = "center";
            container.style.minWidth = "150px";

            // Inline OpenStreetMap images if provided
            if (el.tags.image) {
                const imageUrl = safeHttpUrl(el.tags.image);
                if (imageUrl && /\.(jpeg|jpg|gif|png)$/i.test(imageUrl)) {
                    const img = document.createElement("img");
                    img.src = imageUrl;
                    img.alt = name;
                    img.style.width = "100%";
                    img.style.maxHeight = "120px";
                    img.style.objectFit = "cover";
                    img.style.borderRadius = "4px";
                    img.style.marginBottom = "5px";
                    container.appendChild(img);
                    container.appendChild(document.createElement("br"));
                } else if (imageUrl) {
                    const imageLink = document.createElement("a");
                    imageLink.href = imageUrl;
                    imageLink.target = "_blank";
                    imageLink.rel = "noopener noreferrer";
                    imageLink.style.display = "block";
                    imageLink.style.marginBottom = "5px";
                    imageLink.textContent = "📷 View Image";
                    container.appendChild(imageLink);
                }
            }

            const nameEl = document.createElement("strong");
            nameEl.textContent = name;
            container.appendChild(nameEl);
            if (el.tags.name) {
                container.appendChild(document.createElement("br"));
                const typeEl = document.createElement("em");
                typeEl.textContent = formattedType !== "Attraction" ? formattedType : "Nearby Attraction";
                container.appendChild(typeEl);
            }

            if (el.tags.description) {
                container.appendChild(document.createElement("br"));
                container.appendChild(document.createElement("br"));
                const desc = document.createElement("div");
                desc.style.fontSize = "0.9em";
                desc.style.maxHeight = "100px";
                desc.style.overflowY = "auto";
                desc.textContent = el.tags.description;
                container.appendChild(desc);
            }

            let linkUrl = el.tags.website || el.tags.url;
            if (!linkUrl && el.tags.wikipedia) {
                const wikiMatch = el.tags.wikipedia.match(/^([a-z-]+):(.*)$/);
                if (wikiMatch) {
                    linkUrl = `https://${wikiMatch[1]}.wikipedia.org/wiki/${encodeURIComponent(wikiMatch[2])}`;
                } else {
                    linkUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(el.tags.wikipedia)}`;
                }
            }

            if (linkUrl) {
                if (!linkUrl.startsWith("http")) linkUrl = "http://" + linkUrl;
                const safeUrl = safeHttpUrl(linkUrl);
                if (safeUrl) {
                    container.appendChild(document.createElement("br"));
                    container.appendChild(document.createElement("br"));
                    const link = document.createElement("a");
                    link.href = safeUrl;
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                    link.textContent = "More Info";
                    container.appendChild(link);
                }
            }

            if (canSave) {
                container.appendChild(document.createElement("br"));
                container.appendChild(document.createElement("br"));
                const saveButton = document.createElement("button");
                saveButton.style.padding = "4px";
                saveButton.style.cursor = "pointer";
                saveButton.textContent = "Save to Locations";
                saveButton.addEventListener("click", () => {
                    saveAttraction(map, name, el.lat, el.lon);
                });
                container.appendChild(saveButton);
            }

            L.circleMarker([el.lat, el.lon], {
                radius: 6,
                fillColor: "#9c27b0",
                color: "#fff",
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8,
            })
                .addTo(map)
                .bindPopup(container);
        }
    });
}

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
            setMarker(newLoc.id, marker);
            alert("Attraction saved to locations!");
        } else {
            alert("Failed to save attraction.");
        }
    } catch (err) {
        console.error("Error saving attraction:", err);
        alert("Error saving attraction.");
    }
}
