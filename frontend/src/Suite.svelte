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
  let currentPositionMarker: L.CircleMarker | null = null;
  let watchId: number | null = null;
  let isTracking: boolean = false;
  let gpsStatus: string = "GPS: Not tracking";
  let currentSpeedKmH: string = "--";
  let currentSpeedLimit: number | null = null;
  let autoFollow: boolean = true;
  let wakeLock: any = null; // WakeLockSentinel
  
  let lastSpeedLimitFetch = 0;
  let offlineQueue: {lat: number, lng: number}[] = JSON.parse(localStorage.getItem('gpsOfflineQueue') || '[]');
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

    map.on("dragstart", () => {
      if (isTracking) {
        autoFollow = false;
      }
    });

    // Append the persistent map container to this specific view's map wrapper
    mapContainer.appendChild(container);

    // Ensure Leaflet resizes properly when adopted by the new parent
    setTimeout(() => {
      map.invalidateSize();
    }, 10);

    // Create global function for popup buttons
    (window as any).markVisited = async (id: number) => {
      try {
        await fetch("/api/visited", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });

        visitedIds.add(id);
        visitedIds = visitedIds; // trigger reactivity

        const loc = locations.find((l) => l.id === id);
        const marker = markers[id];

        if (loc && marker) {
          marker.setIcon(visitedIcon);
          marker.setPopupContent(createPopupContent(loc, true));
        }
      } catch (err) {
        console.error("Error marking as visited:", err);
        alert("Failed to mark as visited.");
      }
    };

    (window as any).saveAttraction = async (
      name: string,
      lat: number,
      lng: number,
    ) => {
      try {
        const res = await fetch("/api/locations/single", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, lat, lng }),
        });

        if (res.ok) {
          const data = await res.json();
          // Add to local state
          const newLoc = { id: data.id, name, lat, lng };
          locations = [...locations, newLoc];

          // Render marker
          const marker = L.marker([lat, lng], { icon: defaultIcon })
            .addTo(map)
            .bindPopup(createPopupContent(newLoc, false));
          markers[newLoc.id] = marker;
          alert("Attraction saved to locations!");
        } else {
          alert("Failed to save attraction.");
        }
      } catch (err) {
        console.error("Error saving attraction:", err);
        alert("Error saving attraction.");
      }
    };

    const handleVisibilityChange = () => {
      if (wakeLock !== null && document.visibilityState === 'visible' && isTracking) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    await loadData();
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      delete (window as any).markVisited;
      delete (window as any).saveAttraction;
    };
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
      gpsPath = pathData.map((p: { lat: number; lng: number }) => [
        p.lat,
        p.lng,
      ]);

      renderLocations();
      renderPath();

      const setFallbackView = () => {
        const visitedLocs = locations.filter((l) => visitedIds.has(l.id));
        if (visitedLocs.length > 0) {
          // Assume highest ID is latest visited if no timestamp is available
          const latestVisited = visitedLocs.reduce((prev, current) =>
            prev.id > current.id ? prev : current,
          );
          map.setView([latestVisited.lat, latestVisited.lng], 13);
        } else if (locations.length > 0) {
          const firstLoc = locations.reduce((prev, current) =>
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
            : `<button style="margin-top:5px;padding:4px;cursor:pointer;" onclick="window.markVisited(${loc.id})">Mark as Visited</button>`
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

  async function flushOfflineQueue() {
    if (offlineQueue.length === 0) return;
    try {
      const res = await fetch("/api/path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(offlineQueue),
      });
      if (res.ok) {
        offlineQueue = [];
        localStorage.setItem('gpsOfflineQueue', '[]');
      }
    } catch (e) {
      console.log("Still offline, queue length:", offlineQueue.length);
    }
  }

  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await (navigator as any).wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          console.log('Screen Wake Lock was released');
        });
        console.log('Screen Wake Lock is active');
      } catch (err: any) {
        console.error(`${err.name}, ${err.message}`);
      }
    }
  }

  async function fetchSpeedLimit(lat: number, lng: number) {
    try {
      const res = await fetch(`/api/speed-limit?lat=${lat}&lng=${lng}`);
      if (!res.ok) throw new Error("Proxy failed");
      const data = await res.json();
      currentSpeedLimit = data.speedLimit;
    } catch (e) {
      console.error("Failed to fetch speed limit from proxy", e);
    }
  }

  function startTracking() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    isTracking = true;
    gpsStatus = "GPS: Acquiring signal...";
    requestWakeLock();
    flushOfflineQueue(); // Try to flush any old points when we start

    watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy;
        const speed = position.coords.speed; // meters per second

        gpsStatus = `GPS: Tracking (${accuracy.toFixed(1)}m accuracy)`;
        if (speed !== null && speed !== undefined) {
          const kmh = speed * 3.6;
          currentSpeedKmH = kmh.toFixed(0); // Waze uses whole numbers

          // Only poll API every 15 seconds, and only if driving over 10 km/h to save API quota
          if (kmh > 10 && Date.now() - lastSpeedLimitFetch > 15000) {
            lastSpeedLimitFetch = Date.now();
            fetchSpeedLimit(lat, lng);
          }

        } else {
          currentSpeedKmH = "--";
        }

        if (accuracy > 20) {
          return; // Skip drawing/saving if accuracy is too low
        }

        if (!currentPositionMarker) {
          currentPositionMarker = L.circleMarker([lat, lng], {
            radius: 8,
            fillColor: "#ff7800",
            color: "#000",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8,
          }).addTo(map);
          if (autoFollow) map.setView([lat, lng], 15);
        } else {
          currentPositionMarker.setLatLng([lat, lng]);
          if (autoFollow) map.setView([lat, lng]);
        }

        const lastPoint = gpsPath[gpsPath.length - 1];
        let shouldSave = true;
        if (lastPoint) {
          const dist = map.distance([lat, lng], lastPoint);
          if (dist < 2) shouldSave = false;
        }

        if (shouldSave) {
          gpsPath = [...gpsPath, [lat, lng]];
          renderPath();

          // If we had points waiting, we'll pack the current point into the flush attempt
          if (offlineQueue.length > 0) {
            offlineQueue.push({ lat, lng });
            flushOfflineQueue();
            return;
          }

          try {
            const res = await fetch("/api/path", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lat, lng }),
            });
            if (!res.ok) throw new Error("Failed");
          } catch (e) {
            console.error("Failed to save to DB, queueing offline", e);
            offlineQueue.push({ lat, lng });
            localStorage.setItem('gpsOfflineQueue', JSON.stringify(offlineQueue));
          }
        }
      },
      (error) => {
        let msg = error.message || "Unknown error";
        if (error.code === 1) msg = "Permission denied.";
        else if (error.code === 2)
          msg =
            "Position unavailable (Desktop PCs often lack location hardware).";
        else if (error.code === 3) msg = "Timeout acquiring GPS signal.";

        gpsStatus = `GPS Error: ${msg}`;
        stopTracking();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 27000 },
    );
  }

  function stopTracking() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (wakeLock !== null) {
      wakeLock.release().then(() => { wakeLock = null; });
    }
    isTracking = false;
    currentSpeedKmH = "--";
    currentSpeedLimit = null;
    autoFollow = true;
    gpsStatus = "GPS: Stopped";
    if (currentPositionMarker) {
      map.removeLayer(currentPositionMarker);
      currentPositionMarker = null;
    }
  }

  function centerOnCurrentPos() {
    if (currentPositionMarker) {
      autoFollow = true;
      map.setView(currentPositionMarker.getLatLng(), 15);
    } else {
      alert("No GPS position available yet.");
    }
  }

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
    <h1 style="margin:0;">Trip Tracker</h1>
  </div>
  <div class="buttons">
    {#if !isTracking}
      <button class="btn" on:click={startTracking}>Start Tracking</button>
    {:else}
      <button class="btn stop" on:click={stopTracking}>Stop Tracking</button>
    {/if}
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
      href="/edit"
      class="btn"
      style="text-decoration:none; background-color:#ffc107; color:black;"
      >Edit Location Pins</a
    >
    <a
      href="/"
      class="btn"
      style="text-decoration:none; background-color:#ffc107; color:black;"
      >Leave</a
    >
  </div>
  <div class="status">{gpsStatus}</div>
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
  >
    {#if isTracking}
      <!-- Waze-style Speedometer -->
      <div 
        class="waze-speedometer {currentSpeedLimit && parseInt(currentSpeedKmH) > currentSpeedLimit ? 'over-speed' : ''}"
        on:click={() => {
          // Placeholder for clicking to manually set a speed limit or report it
          // currentSpeedLimit = 80;
        }}
      >
        <div class="speed-value">{currentSpeedKmH}</div>
        <div class="speed-unit">km/h</div>
        
        <!-- Optional Speed Limit Sign -->
        {#if currentSpeedLimit}
          <div class="speed-limit-sign">
            {currentSpeedLimit}
          </div>
        {/if}
      </div>

      <button
        class="current-pos-btn {autoFollow ? 'auto-followed' : ''}"
        on:click|stopPropagation={centerOnCurrentPos}
      >
        {autoFollow ? "📍 Following" : "🧭 Go to Current Pos"}
      </button>
    {/if}
  </div>
</div>
