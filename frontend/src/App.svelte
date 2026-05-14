<script lang="ts">
  import { onMount } from "svelte";
  import L from "leaflet";
  import { getSharedMap } from "./sharedMap";
  import { fetchAndRenderAttractions } from "./attractions";
  import { MIN_ATTRACTIONS_ZOOM } from "./Constants";

  interface LocationData {
    id: number;
    name: string;
    lat: number;
    lng: number;
    imageUrl?: string;
  }

  let map: L.Map;
  let mapContainer: HTMLDivElement;
  let locations: LocationData[] = [];
  let visitedIds: Set<number> = new Set();
  let gpsPath: [number, number][] = [];
  let pathLayerGroup: L.LayerGroup | null = null;
  let findingAttractions: boolean = false;
  let sidebarExpanded: boolean = false;
  let currentZoom: number = 13;

  const markers: Record<number, L.Marker> = {};

  const defaultIcon = new L.Icon.Default();
  const visitedIcon = new L.Icon({
    ...L.Icon.Default.prototype.options,
    iconUrl:
      "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  });

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

    await loadData();
  });

  async function loadData() {
    try {
      const locRes = await fetch("/api/locations");
      locations = await locRes.json();

      const visRes = await fetch("/api/visited");
      const visited = await visRes.json();
      visitedIds = new Set(visited);

      const pathRes = await fetch("/api/path");
      const pathData = await pathRes.json();
      gpsPath = pathData.map((p: LocationData) => [p.lat, p.lng]);

      renderLocations();
      renderPath();

      if (gpsPath.length > 0) {
        map.fitBounds(L.latLngBounds(gpsPath));
      } else if (locations.length > 0) {
        const group = new L.featureGroup(Object.values(markers));
        map.fitBounds(group.getBounds());
      }

      // Fetch images in the background without blocking initial render
      locations.forEach(async (loc: LocationData, index: number) => {
        try {
          const wikiRes = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(loc.name)}`,
          );
          if (wikiRes.ok) {
            const wikiData = await wikiRes.json();
            if (wikiData.thumbnail && wikiData.thumbnail.source) {
              locations[index].imageUrl = wikiData.thumbnail.source;
              locations = [...locations]; // trigger Svelte reactivity
              updateMarkerPopup(loc);
              return;
            }
          }

          const wdRes = await fetch(
            `https://en.wikipedia.org/w/api.php?action=query&generator=geosearch&ggsradius=100&ggscoord=${loc.lat}|${loc.lng}&prop=pageimages&pithumbsize=300&format=json&origin=*`,
          );
          if (wdRes.ok) {
            const wdData = await wdRes.json();
            if (wdData.query && wdData.query.pages) {
              const pages: any[] = Object.values(wdData.query.pages);
              if (pages.length > 0 && pages[0].thumbnail) {
                locations[index].imageUrl = pages[0].thumbnail.source;
                locations = [...locations]; // trigger Svelte reactivity
                updateMarkerPopup(loc);
              }
            }
          }
        } catch (e) {}
      });
    } catch (err) {
      console.error("Error initializing:", err);
    }
  }

  function updateMarkerPopup(loc: LocationData) {
    const marker = markers[loc.id];
    if (marker && marker.getPopup()) {
      marker.setPopupContent(createPopupContent(loc, visitedIds.has(loc.id)));
    }
  }

  function createPopupContent(loc: LocationData, isVisited: boolean): string {
    return `
      <div style="text-align: center; min-width: 120px;">
        ${loc.imageUrl ? `<img src="${loc.imageUrl}" alt="${loc.name}" style="width:100%; max-height:100px; object-fit:cover; border-radius:4px; margin-bottom:5px;" /><br>` : ""}
        <strong>${loc.name}</strong><br>
        ${
          isVisited
            ? '<span style="color:#28a745;font-weight:bold;">✓ Visited</span>'
            : ''
        }
      </div>
    `;
  }

  function renderLocations() {
    locations.forEach((loc) => {
      const isVisited = visitedIds.has(loc.id);
      const marker = L.marker([loc.lat, loc.lng], {
        icon: isVisited ? visitedIcon : defaultIcon,
      })
        .addTo(map)
        .bindPopup(createPopupContent(loc, isVisited));

      markers[loc.id] = marker;
    });
  }

  function renderPath() {
    if (pathLayerGroup) {
      map.removeLayer(pathLayerGroup);
    }
    if (gpsPath.length > 1) {
      const segments = [];
      const len = gpsPath.length;
      for (let i = 0; i < len - 1; i++) {
        // Gradient from Purple (oldest) to Bright Green (newest)
        const fraction = i / (len - 1);
        const hue = 280 - (fraction * 160); // 280 -> 120
        segments.push(
          L.polyline([gpsPath[i], gpsPath[i + 1]], {
            color: `hsl(${hue}, 100%, 50%)`,
            weight: 5
          })
        );
      }
      pathLayerGroup = L.layerGroup(segments).addTo(map);
    }
  }

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
      const marker = markers[loc.id];
      if (marker) {
        marker.openPopup();
      }
    }, 1500);
  }
</script>

<div class="controls">
  <div style="display:flex; align-items:center; gap:10px;">
    <button
      class="sidebar-toggle-btn"
      on:click={() => (sidebarExpanded = !sidebarExpanded)}>☰ Places</button
    >
    <h1 style="margin:0;">Trip Tracker V1</h1>
  </div>
  <div class="buttons">
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
  </div>
</div>

<div class="main-content">
  <div class="sidebar {sidebarExpanded ? 'expanded' : ''}">
    <div class="sidebar-header">
      Saved Locations
      <button
        class="sidebar-toggle-btn"
        on:click={() => (sidebarExpanded = false)}>✕</button
      >
    </div>
    {#each locations as loc}
      <!-- svelte-ignore a11y-click-events-have-key-events - we just want a simple clickable div -->
      <div class="location-item" on:click={() => jumpToLocation(loc)}>
        {#if loc.imageUrl}
          <img class="location-img-thumb" src={loc.imageUrl} alt="" />
        {:else}
          <div
            class="location-img-thumb"
            style="display:flex;align-items:center;justify-content:center;color:#999;font-size:0.7em;"
          >
            No Img
          </div>
        {/if}
        <div class="location-info">
          <div class="location-name">{loc.name}</div>
          {#if visitedIds.has(loc.id)}
            <div class="location-visited">✓ Visited</div>
          {/if}
        </div>
      </div>
    {/each}
    {#if locations.length === 0}
      <div style="padding:15px; color:#666; text-align:center;">
        No locations saved yet.
      </div>
    {/if}
  </div>

  <div
    class="map"
    bind:this={mapContainer}
    on:click={() => (sidebarExpanded = false)}
  ></div>
</div>
