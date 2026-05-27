<script lang="ts">
  import { onMount } from "svelte";
  import L from "leaflet";
  import "@geoman-io/leaflet-geoman-free";
  import { API_BASE } from "./Constants";
  import { authFetch } from "./auth";
  import { getSharedMap } from "./sharedMap";
  import { loadMapBootstrapData, type PathPoint } from "./mapData";
  import TopBar from "./TopBar.svelte";

  let mapContainer: HTMLDivElement;
  let map: L.Map;
  let locations: any[] = [];
  let markers: L.Layer[] = [];
  let pathLayerGroup: L.FeatureGroup | undefined;
  


  const defaultIcon = new L.Icon.Default();

  onMount(async () => {
    const { map: sharedMap, container } = getSharedMap();
    map = sharedMap;

    mapContainer.appendChild(container);

    setTimeout(() => {
      map.invalidateSize();
    }, 10);

    pathLayerGroup = L.featureGroup().addTo(map);

    await loadData();

    map.pm.addControls({
      position: "topleft",
      drawMarker: true,
      drawCircleMarker: false,
      drawPolyline: true,
      drawRectangle: false, // Disabled native rectangle drawing
      drawPolygon: false,
      drawCircle: false,
      editMode: true,
      dragMode: true,
      cutPolygon: true, // SCISSORS TOOL: Draw a shape to cut out lines/points inside it!
      removalMode: true,
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

    map.on("pm:create", (e) => {
      if (e.shape === "Line") {
        e.layer.addTo(pathLayerGroup!);
      } else if (e.shape === "Marker") {
        const ll = (e.layer as L.Marker).getLatLng();
        const newLoc = {
          name: "New Location",
          lat: ll.lat,
          lng: ll.lng,
        };
        locations = [...locations, newLoc];
        renderLocations();
        map.removeLayer(e.layer);
      }
    });

    return () => {
      delete (window as any).editLocName;
      delete (window as any).deleteLoc;
      if (map) {
        map.off("pm:create");
        map.pm.removeControls();
        map.pm.disableDraw();
        if (pathLayerGroup) map.removeLayer(pathLayerGroup);
      }
    };
  });


  async function loadData() {
    try {
      const data = await loadMapBootstrapData();
      locations = data.locations;
      renderLocations();
      renderPaths(data.pathData);

      if (markers && markers.length > 0) {
        const group = new L.featureGroup(markers);
        map.fitBounds(group.getBounds());
      }
    } catch (e) {
      console.error("Failed to load map data", e);
    }
  }

  function renderLocations() {
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

  function splitTripsByGap(pathData: PathPoint[], gapMinutes = 30): PathPoint[][] {
    const trips: PathPoint[][] = [];
    let currentTrip: PathPoint[] = [];
    const gapMs = gapMinutes * 60 * 1000;
    let previousTimestamp: number | null = null;

    for (const point of pathData) {
      const nextTimestamp = point.timestamp ? Date.parse(point.timestamp) : Number.NaN;
      const hasGap =
        currentTrip.length > 0 &&
        previousTimestamp !== null &&
        Number.isFinite(nextTimestamp) &&
        nextTimestamp - previousTimestamp > gapMs;

      if (hasGap) {
        trips.push(currentTrip);
        currentTrip = [];
      }

      currentTrip.push(point);

      if (Number.isFinite(nextTimestamp)) {
        previousTimestamp = nextTimestamp;
      }
    }

    if (currentTrip.length > 0) {
      trips.push(currentTrip);
    }

    return trips;
  }

  function simplifyTrip(trip: PathPoint[], toleranceMeters: number): PathPoint[] {
    if (trip.length < 3) return trip;
    const res = [trip[0]];
    let last = trip[0];

    for (let i = 1; i < trip.length - 1; i++) {
      const pt = trip[i];
      // Basic distance drop: if current point is within <toleranceMeters> of the last retained point, skip it
      const dist = map.distance([last.lat, last.lng], [pt.lat, pt.lng]);
      if (dist > toleranceMeters) {
        res.push(pt);
        last = pt;
      }
    }
    res.push(trip[trip.length - 1]);
    return res;
  }

  function renderPaths(pathData: PathPoint[]) {
    pathLayerGroup?.clearLayers();
    if (!pathLayerGroup) return;

    const trips = splitTripsByGap(pathData);
    trips.forEach((trip) => {
      const simplified = simplifyTrip(trip, 5); // 5 meter tolerance removes thousands of redundant jitter vertices
      if (simplified.length < 2) return;
      const latlngs = simplified.map((p) => [p.lat, p.lng] as L.LatLngTuple);
      const polyline = L.polyline(latlngs, {
        color: "blue",
        weight: 5,
        pmIgnore: false,
      });
      // Attach the original timestamps to the layer so we can potentially save them back
      // Since geoman can add/remove vertices, exact timestamps might not map 1:1 anymore,
      // but we can try to store them or just let the new points have current timestamps.
      (polyline as any)._originalPoints = simplified; 
      polyline.addTo(pathLayerGroup);
    });
  }

  async function saveLocations() {
    try {
      const res = await authFetch(API_BASE + "/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          locations.map((l) => ({ name: l.name, lat: l.lat, lng: l.lng })),
        ),
      });
      if (res.ok) alert("Successfully saved locations!");
      else alert("Failed to save locations.");
    } catch (e) {
      alert("Error saving locations.");
      console.error(e);
    }
  }

  async function saveTraces() {
    if (!pathLayerGroup) return;
    
    let newPathData: PathPoint[] = [];
    let baseTime = new Date("2020-01-01T00:00:00Z").getTime();
    
    pathLayerGroup.eachLayer((layer: any) => {
      if (layer instanceof L.Polyline) {
        const latlngs = layer.getLatLngs() as L.LatLng[] | L.LatLng[][];
        const flatten = (arr: any[]): L.LatLng[] => {
          if (!arr || arr.length === 0) return [];
          if (Array.isArray(arr[0])) {
            return arr.flatMap(flatten);
          }
          return arr;
        };

        const flatLatLngs = flatten(latlngs as any[]);
        
        flatLatLngs.forEach((ll, index) => {
           newPathData.push({
             lat: ll.lat,
             lng: ll.lng,
             timestamp: new Date(baseTime + index * 1000).toISOString()
           });
        });

        // Jump 1 hour so the next polyline counts as a separate trip
        baseTime += flatLatLngs.length * 1000 + 3600000;
      }
    });

    try {
      const res = await authFetch(API_BASE + "/api/path", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPathData),
      });
      if (res.ok) alert("Successfully saved traces!");
      else alert("Failed to save traces.");
    } catch (e) {
      alert("Error saving traces.");
      console.error(e);
    }
  }
</script>

<TopBar
  title="Edit Mode"
  showVisitorCount={false}
  statusText="Use scissors tool (Cut) to cut sections from traces, or Edit to move points."
>
  <svelte:fragment slot="buttons">
    <button class="btn" style="background-color: #28a745;" on:click={saveLocations}>
      Save Locs
    </button>
    <button class="btn" style="background-color: #007bff;" on:click={saveTraces}>
      Save Traces
    </button>
    <a href="/suite" class="btn" style="text-decoration:none; background-color: #6c757d;">
      Back
    </a>
  </svelte:fragment>
</TopBar>

<div class="map" bind:this={mapContainer}></div>
