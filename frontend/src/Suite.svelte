<script lang="ts">
    import { onMount } from "svelte";
    import L from "leaflet";

    import TopBar from "./components/TopBar.svelte";
    import SideBar from "./components/SideBar.svelte";
    import { loadData } from "./helpers/mapData";
    import type { LeafletWindow } from "./typed/Typed";
    import { Gps } from "./helpers/gps";
    import { markVisited } from "./helpers/locationMarkers";
    import { MIN_ATTRACTIONS_ZOOM } from "./helpers/Constants";
    import { fetchAndRenderAttractions, saveAttraction } from "./helpers/attractions";
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

        map.on("zoomend", () => {
            reRenderPathBasedOnZoom(map);
            currentZoom = map.getZoom();
        });

        map.on("dragstart", () => {
            if (get(autoFollow)) {
                autoFollow.update(() => false);
            }
        });
        
        // Append the persistent map container to this specific view's map wrapper
        mapContainer.appendChild(container);

        // Ensure Leaflet resizes properly when adopted by the new parent
        setTimeout(() => {
            map.invalidateSize();
        }, 10);

        // Create global function for popup buttons
        (window as LeafletWindow).markVisited = (id) => markVisited(id);
        (window as LeafletWindow).saveAttraction = (map, name, lat, lng) => saveAttraction(map, name, lat, lng);

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
        return () => {
            document.removeEventListener(
                "visibilitychange",
                tracker.handleVisibilityChange,
            );
            delete (window as LeafletWindow).markVisited;
            delete (window as LeafletWindow).saveAttraction;
        };
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
        sidebarExpanded = false;
        const bounds = showTripsOnMap(map, [tripId]);
        if (bounds) {
            setTimeout(() => {
                map.invalidateSize();
                map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 15, duration: 1.5 });
            }, 350);
        }
    }

    function showTrips(tripIds: number[]) {
        if (!get(pathDataReady) || get(gpsPath).length === 0) {
            alert("Trip data is still loading. Please wait a moment and try again.");
            return;
        }
        sidebarExpanded = false;
        const bounds = showTripsOnMap(map, tripIds);
        if (bounds) {
            setTimeout(() => {
                map.invalidateSize();
                map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 15, duration: 1.5 });
            }, 350);
        }
    }

    function routeGuidance(tripId: number) {
        if (!get(pathDataReady) || get(gpsPath).length === 0) {
            alert("Trip data is still loading. Please wait a moment and try again.");
            return;
        }
        sidebarExpanded = false;
        const bounds = showTripRoute(map, tripId);
        if (bounds) {
            setTimeout(() => {
                map.invalidateSize();
                map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 15, duration: 1.5 });
            }, 350);
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

    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
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
