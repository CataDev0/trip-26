import L from "leaflet";
import { API_BASE } from "./Constants";
import { locations, renderLocations, updateMarkerPopup, visitedIds } from "./locationMarkers";
import { renderPath, toLatLngPath } from "./tripPath";
import { gpsPath } from "../stores/tripStore";

export interface LocationData {
    id: number;
    name: string;
    lat: number;
    lng: number;
    imageUrl?: string;
}

export interface PathPoint {
    id?: number;
    lat: number;
    lng: number;
    timestamp?: string;
}

export interface MapBootstrapData {
    locations: LocationData[];
    visitedIds: Set<number>;
    pathData: PathPoint[];
}

export async function loadMapBootstrapData(): Promise<MapBootstrapData> {
    const [locationsRes, visitedRes, pathRes] = await Promise.all([
        fetch(API_BASE + "/api/locations"),
        fetch(API_BASE + "/api/visited"),
        fetch(API_BASE + "/api/path"),
    ]);

    if (!locationsRes.ok) {
        throw new Error("Failed to load locations");
    }

    if (!visitedRes.ok) {
        throw new Error("Failed to load visited locations");
    }

    if (!pathRes.ok) {
        throw new Error("Failed to load path data");
    }

    const [locations, visited, pathData] = await Promise.all([
        locationsRes.json(),
        visitedRes.json(),
        pathRes.json(),
    ]);

    return {
        locations,
        visitedIds: new Set(visited),
        pathData,
    };
}

export async function loadData(map: L.Map) {
    try {
        const data = await loadMapBootstrapData();

        locations.update(() => data.locations);
        visitedIds.update(() => data.visitedIds);
        gpsPath.update(() => data.pathData);

        renderLocations(map);
        renderPath(map);

        const setFallbackView = () => {
            const visitedLocs = data.locations.filter((l) => data.visitedIds.has(l.id));
            if (visitedLocs.length > 0) {
                // Assume highest ID is latest visited if no timestamp is available
                const latestVisited = visitedLocs.reduce((prev, current) =>
                    prev.id > current.id ? prev : current,
                );
                map.setView([latestVisited.lat, latestVisited.lng], 13);
                map.fitBounds(L.latLngBounds(toLatLngPath(data.pathData)));
                const firstLoc = data.locations.reduce((prev, current) =>
                    prev.id < current.id ? prev : current,
                );
                map.setView([firstLoc.lat, firstLoc.lng], 13);
            }
        };

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    map.setView([pos.coords.latitude, pos.coords.longitude], 13);
                },
                () => setFallbackView(),
                { timeout: 5000 },
            );
        } else {
            setFallbackView();
        }

        // Fetch images in the background without blocking initial render
        data.locations.forEach(async (loc: LocationData, index: number) => {
            try {
                const wikiUrl = new URL(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(loc.name)}`);
                const wikiRes = await fetch(wikiUrl);
                if (wikiRes.ok) {
                    const wikiData = await wikiRes.json();
                    if (wikiData.thumbnail && wikiData.thumbnail.source) {
                        locations.update((locs) => {
                            locs[index].imageUrl = wikiData.thumbnail.source;
                            return locs;
                        });
                        updateMarkerPopup(loc);
                        return;
                    }
                }

                const wdUrl = new URL("https://en.wikipedia.org/w/api.php");
                wdUrl.searchParams.set("action", "query");
                wdUrl.searchParams.set("generator", "geosearch");
                wdUrl.searchParams.set("ggsradius", "100");
                wdUrl.searchParams.set("ggscoord", `${loc.lat}|${loc.lng}`);
                wdUrl.searchParams.set("prop", "pageimages");
                wdUrl.searchParams.set("pithumbsize", "300");
                wdUrl.searchParams.set("format", "json");
                wdUrl.searchParams.set("origin", "*");
                    
                const wdRes = await fetch(wdUrl);
                if (wdRes.ok) {
                    const wdData = await wdRes.json();
                    if (wdData.query && wdData.query.pages) {
                        const pages: { thumbnail?: { source?: string } }[] = Object.values(wdData.query.pages);
                        if (pages.length > 0 && pages[0].thumbnail) {
                            locations.update((locs) => {
                                locs[index].imageUrl = pages[0].thumbnail?.source;
                                return locs;
                            });
                            updateMarkerPopup(loc);
                        }
                    }
                }
            } catch { /* empty */ }
        });
    } catch (err) {
        console.error("Error initializing:", err);
    }
}
