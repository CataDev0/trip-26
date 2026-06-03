import L from "leaflet";
import { AttractionData } from "../typed/Typed";

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

            let popupContent = "<div style=\"text-align: center; min-width: 150px;\">";

            // Inline OpenStreetMap images if provided
            if (el.tags.image) {
                if (el.tags.image.match(/\.(jpeg|jpg|gif|png)$/i)) {
                    popupContent += `<img src="${el.tags.image}" alt="${name}" style="width:100%; max-height:120px; object-fit:cover; border-radius:4px; margin-bottom:5px;" /><br>`;
                } else {
                    popupContent += `<a href="${el.tags.image}" target="_blank" rel="noopener noreferrer" style="display:block; margin-bottom:5px;">📷 View Image</a>`;
                }
            }

            popupContent += `<strong>${name}</strong>`;
            if (el.tags.name) {
                popupContent += `<br><em>${formattedType !== "Attraction" ? formattedType : "Nearby Attraction"}</em>`;
            }

            if (el.tags.description) {
                popupContent += `<br><br><div style="font-size: 0.9em; max-height: 100px; overflow-y: auto;">${el.tags.description}</div>`;
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
                popupContent += `<br><br><a href="${linkUrl}" target="_blank" rel="noopener noreferrer">More Info</a>`;
            }

            if (canSave) {
                popupContent += `<br><br><button style="padding:4px;cursor:pointer;" onclick="window.saveAttraction('${name.replace(/'/g, "\\'")}', ${el.lat}, ${el.lon})">Save to Locations</button>`;
            }

            popupContent += "</div>";

            L.circleMarker([el.lat, el.lon], {
                radius: 6,
                fillColor: "#9c27b0",
                color: "#fff",
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8,
            })
                .addTo(map)
                .bindPopup(popupContent);
        }
    });
}
