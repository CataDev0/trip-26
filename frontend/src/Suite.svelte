<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import L from "leaflet";

    import TopBar from "./components/TopBar.svelte";
    import SideBar from "./components/SideBar.svelte";
    import { loadData } from "./helpers/mapData";
    import { Gps } from "./helpers/gps";
    import { MIN_ATTRACTIONS_ZOOM } from "./helpers/Constants";
    import { fetchAndRenderAttractions } from "./helpers/attractions";
    import { getAuthHeader } from "./helpers/auth";
    import { getSharedMap, reRenderPathBasedOnZoom } from "./helpers/sharedMap";
    import { showTripRoute, showTripsOnMap } from "./helpers/tripPath";
    import { canSaveLocations } from "./stores/editStore";
    import { autoFollow, isTracking, gpsStatus, currentSpeedLimit, currentSpeedKmH, gpsPath, pathDataReady } from "./stores/tripStore";
    import { get } from "svelte/store";

    let map: L.Map;
    let mapContainer: HTMLDivElement;
    let tracker: Gps;

    let findingAttractions: boolean = false;
    let sidebarExpanded: boolean = false;
    let currentZoom: number = 13;

    onMount(async () => {
        const { map: sharedMap, container } = getSharedMap();
        map = sharedMap;

        tracker = new Gps(map);

        // Enable save buttons in edit view
        canSaveLocations.update(() => true); 
        
        currentZoom = map.getZoom() || 13;

        // Named handlers so onDestroy can remove them from the shared map
        map.on("zoomend", onZoomEnd);
        map.on("dragstart", onDragStart);

        // Append the persistent map container to this specific view's map wrapper
        // eslint-disable-next-line svelte/no-dom-manipulating -- the shared map container is adopted into this view by design
        mapContainer.appendChild(container);

        // Ensure Leaflet resizes properly when adopted by the new parent
        setTimeout(() => {
            map.invalidateSize();
        }, 10);

        document.addEventListener(
            "visibilitychange",
            tracker.handleVisibilityChange,
        );

        await loadData(map);

        const authHeader = getAuthHeader();
        if (!(await authHeader).Authorization) {
            // No auth, show login modal
            window.dispatchEvent(new CustomEvent("require-login"));
        }
    });

    const onZoomEnd = () => {
        reRenderPathBasedOnZoom(map);
        currentZoom = map.getZoom();
    };

    const onDragStart = () => {
        if (get(autoFollow)) {
            autoFollow.update(() => false);
        }
    };

    // The map is a singleton that persists across views — remove everything
    // this view registered (Svelte ignores onMount return values)
    onDestroy(() => {
        if (tracker) {
            tracker.stopTracking();
        }
        if (map) {
            map.off("zoomend", onZoomEnd);
            map.off("dragstart", onDragStart);
        }
        document.removeEventListener(
            "visibilitychange",
            tracker.handleVisibilityChange,
        );
    });

    async function findAttractions() {
        findingAttractions = true;
        try {
            await fetchAndRenderAttractions(map, true);
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
</script>

<TopBar
    showSidebarToggle={true}
    statusText={$gpsStatus}
    on:toggleSidebar={() => (sidebarExpanded = !sidebarExpanded)}
>
    <svelte:fragment slot="buttons">
        {#if !$isTracking}
            <button class="btn" on:click={() => tracker.startTracking()}
                >Start Tracking</button
            >
        {:else}
            <button class="btn stop" on:click={() => tracker.stopTracking()}
                >Stop Tracking</button
            >
        {/if}
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
            href="/edit"
            class="btn"
            style="margin-left: auto; text-decoration:none; background-color:#ffc107; color:black;"
            >Edit Mode</a
        >
        <a
            href="/"
            class="btn"
            style="text-decoration:none; background-color:#ffc107; color:black;"
            >Leave</a
        >
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
        aria-label="Map view showing current location and nearby attractions"
        role="region"
    >
        {#if $isTracking}
            <!-- Waze-style Speedometer -->
            <div
                class="waze-speedometer {($currentSpeedLimit && $currentSpeedKmH) &&
                $currentSpeedKmH > $currentSpeedLimit
                    ? "over-speed"
                    : ""}"
            >
                <div class="speed-value">{$currentSpeedKmH || "--"}</div>
                <div class="speed-unit">km/h</div>

                <!-- Optional Speed Limit Sign -->
                {#if $currentSpeedLimit}
                    <div class="speed-limit-sign">
                        {$currentSpeedLimit}
                    </div>
                {/if}
            </div>

            <button
                class="current-pos-btn {$autoFollow ? "auto-followed" : ""}"
                on:click|stopPropagation={() => tracker.centerOnCurrentPos()}
            >
                {$autoFollow ? "📍 Following" : "🧭 Go to Current Pos"}
            </button>
        {/if}
    </div>
</div>
