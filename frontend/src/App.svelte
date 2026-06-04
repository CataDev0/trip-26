<script lang="ts">
  import { onMount } from "svelte";
  import L from "leaflet";

  import TopBar from "./components/TopBar.svelte";
  import { loadData, type LocationData } from "./helpers/mapData";
  import { MIN_ATTRACTIONS_ZOOM } from "./helpers/Constants";
  import { fetchAndRenderAttractions } from "./helpers/attractions";
  import { getSharedMap } from "./helpers/sharedMap";
  import { getMarker } from "./helpers/locationMarkers";
  import SideBar from "./components/SideBar.svelte";
    import { canSaveLocations } from "./stores/editStore";

  let map: L.Map;
  let mapContainer: HTMLDivElement;

  let findingAttractions: boolean = false;
  let sidebarExpanded: boolean = false;
  let currentZoom: number = 13;

  onMount(async () => {
      const { map: sharedMap, container } = getSharedMap();
      map = sharedMap; // Use the stored Leaflet map reference

      currentZoom = map.getZoom() || 13;
      map.on("zoomend", () => {
          currentZoom = map.getZoom();
      });

      // Append the persistent map container to this specific view's map wrapper
      mapContainer.appendChild(container);

      // Ensure Leaflet resizes properly when adopted by the new parent
      setTimeout(() => {
          map.invalidateSize();
      }, 10);

      canSaveLocations.update(() => false); // Disable save buttons on main view
      await loadData(map, false);
  });

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

  function jumpToLocation(loc: LocationData) {
      sidebarExpanded = false;
      map.flyTo([loc.lat, loc.lng], 16, { duration: 1.5 });

      // Give it a moment to fly there before opening popup
      setTimeout(() => {
          const marker = getMarker(loc.id);
          if (marker) {
              marker.openPopup();
          }
      }, 1500);
  }
</script>

<TopBar
  title="Trip Tracker V1"
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
              ? "Zoom in to find attractions"
              : "Find Nearby Attractions"}
    </button>
    <a
      href="/suite"
      class="btn"
      style="text-decoration:none; background-color:#ffc107; color:black;"
      >Enter</a
    >
  </svelte:fragment>
</TopBar>

<div class="main-content">
  <SideBar {sidebarExpanded} on:jump={(e) => jumpToLocation(e.detail)} />

  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="map"
    bind:this={mapContainer}
    on:click={() => (sidebarExpanded = false)}
  ></div>
</div>
