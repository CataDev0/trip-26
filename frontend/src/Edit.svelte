<script lang="ts">
  import { onMount } from "svelte";
  import L from "leaflet";
  import { API_BASE } from "./Constants";
  import { authFetch } from "./auth";
  import { getSharedMap } from "./sharedMap";
  import TopBar from "./TopBar.svelte";

  let mapContainer: HTMLDivElement;
  let map: L.Map;
  let locations: any[] = [];
  let markers: L.Layer[] | undefined = [];
  
  let mode: "pins" | "normalize" = "pins";
  let selectStart: L.LatLng | null = null;
  let selectEnd: L.LatLng | null = null;
  let selectionRect: L.Rectangle | null = null;
  let pathLines: L.Polyline[] = [];
  let statusText = "Click map to add a pin. Drag a pin to move it.";

  const defaultIcon = new L.Icon.Default();

  onMount(async () => {
    const { map: sharedMap, container } = getSharedMap();
    map = sharedMap; // Use the stored Leaflet map reference

    // Append the persistent map container to this specific view's map wrapper
    mapContainer.appendChild(container);

    // Ensure Leaflet resizes properly when adopted by the new parent
    setTimeout(() => {
      map.invalidateSize();
    }, 10);
    await loadLocations();
    await loadPath();

    // Map click adds new location visually
    map.on("click", (e) => {
      if (mode === "pins") {
        const newLoc = {
          name: "New Location",
          lat: e.latlng.lat,
          lng: e.latlng.lng,
        };
        locations = [...locations, newLoc];
        renderLocations();
      } else if (mode === "normalize") {
        if (!selectStart) {
          selectStart = e.latlng;
          selectEnd = null;
          if (selectionRect) map.removeLayer(selectionRect);
          selectionRect = null;
          statusText = "Click again to finish the normalization zone.";
        } else {
          selectEnd = e.latlng;
          const bounds = L.latLngBounds(selectStart, selectEnd);
          if (selectionRect) map.removeLayer(selectionRect);
          selectionRect = L.rectangle(bounds, {color: "#ff7800", weight: 2}).addTo(map);
          statusText = "Zone selected! Click 'Apply Normalization' or click again to draw a new zone.";
          selectStart = null; // reset for next box
        }
      }
    });

    // Global hooks inside popup HTML snippets
    (window as any).editLocName = (id: number, newName: string) => {
      locations[id].name = newName;
    };
    (window as any).deleteLoc = (id: number) => {
      locations.splice(id, 1);
      locations = [...locations];
      renderLocations();
    };

    return () => {
      delete (window as any).editLocName;
      delete (window as any).deleteLoc;
      if (map) map.remove();
    };
  });

  async function loadPath() {
    const res = await fetch(API_BASE + "/api/path");
    const data = await res.json();
    const pts = data.map((d: any) => [d.lat, d.lng] as [number, number]);
    if (pts.length > 0) {
      if (pathLines.length) {
        pathLines.forEach(l => map.removeLayer(l));
        pathLines = [];
      }
      pathLines.push(L.polyline(pts, { color: 'blue', weight: 3, opacity: 0.5 }).addTo(map));
    }
  }

  async function loadLocations() {
    const res = await fetch(API_BASE + "/api/locations");
    locations = await res.json();
    renderLocations();

    if (markers && markers.length > 0) {
      const group: L.FeatureGroup = new L.featureGroup(markers);
      map.fitBounds(group.getBounds());
    }
  }

  function renderLocations() {
    // Clear old markers
    markers?.forEach((m) => map.removeLayer(m));
    markers = [];

    locations.forEach((loc, index) => {
      const marker = L.marker([loc.lat, loc.lng], {
        draggable: true,
        icon: defaultIcon,
      }).addTo(map);

      marker.on("dragend", (e) => {
        const pos = e.target.getLatLng();
        locations[index].lat = pos.lat;
        locations[index].lng = pos.lng;
      });

      marker.bindPopup(`
        <div style="min-width:150px">
          <strong>Edit Name:</strong><br>
          <input type="text" value="${loc.name.replace(/"/g, "&quot;")}" onchange="window.editLocName(${index}, this.value)" style="width:100%;margin:5px 0" />
          <br>
          <button onclick="window.deleteLoc(${index})" style="background:red;color:white;border:none;padding:4px;cursor:pointer;width:100%">Delete Location</button>
        </div>
      `);

      markers?.push(marker);
    });
  }

  async function saveChanges() {
    try {
      const res = await authFetch(API_BASE + "/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only strip out 'id' just in case. Ensure clean lat/lng and name.
        body: JSON.stringify(
          locations.map((l) => ({ name: l.name, lat: l.lat, lng: l.lng })),
        ),
      });
      if (res.ok) alert("Successfully saved to locations.json!");
      else alert("Failed to save.");
    } catch (e) {
      alert("Error saving changes.");
      console.error(e);
    }
  }

  async function normalizePath() {
    let confirmMsg = "This will clean up your ENTIRE GPS history by removing jitter and duplicate points. Continue?";
    let bodyData: any = {};
    if (mode === "normalize" && selectionRect) {
      confirmMsg = "This will clean up the GPS history inside your selected zone ONLY. Continue?";
      const bounds = selectionRect.getBounds();
      bodyData.bounds = {
        minLat: bounds.getSouth(),
        maxLat: bounds.getNorth(),
        minLng: bounds.getWest(),
        maxLng: bounds.getEast()
      };
    } else if (mode === "normalize" && !selectionRect) {
      alert("Please draw an area on the map first, or switch to Edit Pins mode to normalize the entire path.");
      return;
    }

    if (!confirm(confirmMsg)) return;

    try {
      const res = await authFetch(API_BASE + "/api/path/normalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData)
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Path normalized successfully! Removed ${data.removed} erratic/duplicate points.`);
        await loadPath(); // refresh visual path
        if (selectionRect) {
          map.removeLayer(selectionRect);
          selectionRect = null;
          statusText = "Click map to set the first corner of a new normalization zone.";
        }
      } else {
        alert("Failed to normalize path.");
      }
    } catch (e) {
      alert("Error normalizing path.");
      console.error(e);
    }
  }

  function toggleMode() {
    if (mode === "pins") {
      mode = "normalize";
      statusText = "Click map to set the first corner of a normalization zone.";
    } else {
      mode = "pins";
      statusText = "Click map to add a pin. Drag a pin to move it.";
      if (selectionRect) map.removeLayer(selectionRect);
      selectionRect = null;
      selectStart = null;
      selectEnd = null;
    }
  }
</script>

<TopBar
  title="Edit Mode"
  showVisitorCount={false}
  {statusText}
>
  <svelte:fragment slot="buttons">
    <button
      class="btn"
      style="background-color: #17a2b8; color: #fff; margin-right: 5px;"
      on:click={toggleMode}
    >
      {mode === "pins" ? "Switch to Normalize Mode" : "Switch to Edit Pins Mode"}
    </button>
    
    {#if mode === "normalize"}
      <button
        class="btn"
        style="background-color: #ff9800; color: #000; margin-right: 5px;"
        on:click={normalizePath}>Apply Normalization</button
      >
    {:else}
      <button
        class="btn"
        style="background-color: #ff9800; color: #000; margin-right: 5px;"
        on:click={normalizePath}>Normalize ENTIRE Path</button
      >
      <button
        class="btn"
        style="background-color: #28a745;"
        on:click={saveChanges}>Save Changes</button
      >
    {/if}
    <a
      href="/suite"
      class="btn"
      style="text-decoration:none; background-color: #6c757d; margin-left: 5px;">Back to Map</a
    >
  </svelte:fragment>
</TopBar>

<div class="map" bind:this={mapContainer}></div>
