<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import L from "leaflet";

    import TopBar from "./components/TopBar.svelte";
    import { loadData } from "./helpers/mapData";
    import { MIN_ATTRACTIONS_ZOOM } from "./helpers/Constants";
    import { fetchAndRenderAttractions } from "./helpers/attractions";
    import { getSharedMap, reRenderPathBasedOnZoom } from "./helpers/sharedMap";
    import { showTripRoute, showTripsOnMap } from "./helpers/tripPath";
    import SideBar from "./components/SideBar.svelte";
    import { canSaveLocations } from "./stores/editStore";
    import { isLiveTracking } from "./stores/appStore";
    import { LiveTracking } from "./helpers/liveTracking";
    import { gpsPath, pathDataReady } from "./stores/tripStore";
    import { get } from "svelte/store";
  import { LogIn } from "lucide-svelte";

    let map: L.Map;
    let mapContainer: HTMLDivElement;

    let findingAttractions: boolean = false;
    let sidebarExpanded: boolean = false;
    let currentZoom: number = 13;
    let trackingTimeout: ReturnType<typeof setTimeout>;

    onMount(async () => {
        const { map: sharedMap, container } = getSharedMap();
        // Use the stored Leaflet map reference
        map = sharedMap;

        currentZoom = map.getZoom() || 13;

        map.on("zoomend", () => {
            reRenderPathBasedOnZoom(map);
            currentZoom = map.getZoom();
        });

        // Append the persistent map container to this specific view's map wrapper
        // eslint-disable-next-line svelte/no-dom-manipulating -- the shared map container is adopted into this view by design
        mapContainer.appendChild(container);

        // Ensure Leaflet resizes properly when adopted by the new parent
        setTimeout(() => {
            map.invalidateSize();
        }, 10);

        canSaveLocations.update(() => false);
        await loadData(map);

        const liveTracking = new LiveTracking();
        liveTracking.init(map);

        function scheduleNextUpdate() {
            const delay = get(isLiveTracking) ? 10_000 : 60_000;
            trackingTimeout = setTimeout(async () => {
                await liveTracking.updateLiveTracking();
                scheduleNextUpdate();
            }, delay);
        }

        // Run once immediately, then schedule based on current state
        await liveTracking.updateLiveTracking();
        scheduleNextUpdate();

        window.addEventListener("logged-out", onLoggedOut);
    });

    // Reload map data after logging out
    const onLoggedOut = async () => {
        await loadData(map);
    };

    async function findAttractions() {
        findingAttractions = true;
        try {
            await fetchAndRenderAttractions(map, false);
        } catch (err) {
            console.error("Failed to fetch attractions", err);
            alert("Failed to load attractions.");
        } finally {
            findingAttractions = false;
        }
    }

    function showTrip(tripId: number) {
        if (!get(pathDataReady) || get(gpsPath).length === 0) {
            alert("Trip data is still loading. Please wait a moment and try again.");
            return;
        }
        const bounds = showTripsOnMap(map, [tripId]);
        if (bounds) {
            map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 15, duration: 1.5 });
        }
    }

    function showTrips(tripIds: number[]) {
        if (!get(pathDataReady) || get(gpsPath).length === 0) {
            alert("Trip data is still loading. Please wait a moment and try again.");
            return;
        }
        const bounds = showTripsOnMap(map, tripIds);
        if (bounds) {
            map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 15, duration: 1.5 });
        }
    }

    function routeGuidance(tripId: number) {
        if (!get(pathDataReady) || get(gpsPath).length === 0) {
            alert("Trip data is still loading. Please wait a moment and try again.");
            return;
        }
        const bounds = showTripRoute(map, tripId);
        if (bounds) {
            map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 15, duration: 1.5 });
        }
    }

    onDestroy(() => {
        clearTimeout(trackingTimeout);
        window.removeEventListener("logged-out", onLoggedOut);
    });
</script>

<TopBar
    showSidebarToggle={true}
    on:toggleSidebar={() => (sidebarExpanded = !sidebarExpanded)}
>
    <svelte:fragment slot="buttons">
        <button
            class="btn"
            on:click={findAttractions}
            disabled={findingAttractions || currentZoom < MIN_ATTRACTIONS_ZOOM}
        >
            {findingAttractions
                ? "Loading..."
                : currentZoom < MIN_ATTRACTIONS_ZOOM
                    ? "Zoom to find attractions"
                    : "Find Nearby Attractions"}
        </button>
        <a
            href="/suite"
            class="btn"
            style="margin-left: auto; text-decoration:none; background-color:#ffcc00; color:black;"
            >Enter <LogIn size="16" style="vertical-align: middle;" /></a
        >
        {#if $isLiveTracking}
            <button
                on:click={async () => {
                    const loc = await LiveTracking.getLiveTracking();
                    if (loc) {
                        map.flyTo([loc.lat, loc.lng], 16, { duration: 1.5 });
                    }
                }}
                class="btn"
                style="text-decoration:none; background-color:#28a745; color:white;"
                >Follow Live Tracking
            </button>
        {/if}
    </svelte:fragment>
</TopBar>

<div class="main-content">
    <SideBar
        {sidebarExpanded}
        on:showTrip={(e) => showTrip(e.detail)}
        on:showTrips={(e) => showTrips(e.detail)}
        on:routeGuidance={(e) => routeGuidance(e.detail)}
    />

    <div
        class="map"
        bind:this={mapContainer}
    ></div>
</div>
