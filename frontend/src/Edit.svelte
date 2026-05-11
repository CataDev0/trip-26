<script lang="ts">
  import { onMount } from "svelte";
  import L from "leaflet";
  import { getSharedMap } from "./sharedMap";

  let mapContainer: HTMLDivElement;
  let map: L.Map;
  let locations: any[] = [];
  let markers: L.Layer[] | undefined = [];

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

    // Map click adds new location visually
    map.on("click", (e) => {
      const newLoc = {
        name: "New Location",
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      };
      locations = [...locations, newLoc];
      renderLocations();
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

  async function loadLocations() {
    const res = await fetch("/api/locations");
    locations = await res.json();
    renderLocations();

    if (markers && markers.length > 0) {
      const group = new L.featureGroup(markers);
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
      const res = await fetch("/api/locations", {
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
</script>

<div class="controls">
  <h1>Edit Mode</h1>
  <div class="buttons">
    <button
      class="btn"
      style="background-color: #28a745;"
      on:click={saveChanges}>Save Changes</button
    >
    <a
      href="/suite"
      class="btn"
      style="text-decoration:none; background-color: #6c757d;">Back to Map</a
    >
  </div>
  <div class="status">Click map to add a pin. Drag a pin to move it.</div>
</div>

<div class="map" bind:this={mapContainer}></div>
