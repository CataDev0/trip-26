<script>
  import { onMount } from 'svelte';
  import L from 'leaflet';
  import { getSharedMap } from './sharedMap.js';
  
  let map;
  let mapContainer;
  let locations = [];
  let visitedIds = new Set();
  let gpsPath = [];
  let pathPolyline = null;
  let currentPositionMarker = null;
  let watchId = null;
  let isTracking = false;
  let gpsStatus = 'GPS: Not tracking';
  let findingAttractions = false;
  let sidebarExpanded = false;
  
  const markers = {};
  
  const defaultIcon = new L.Icon.Default();
  const visitedIcon = new L.Icon({
    ...L.Icon.Default.prototype.options,
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  });
  
  onMount(async () => {
    const { map: sharedMap, container } = getSharedMap();
    map = sharedMap; // Use the stored Leaflet map reference
    
    // Append the persistent map container to this specific view's map wrapper
    mapContainer.appendChild(container);
    
    // Ensure Leaflet resizes properly when adopted by the new parent
    setTimeout(() => { map.invalidateSize(); }, 10);

    // Create global function for popup buttons
    window.markVisited = async (id) => {
      try {
        await fetch('/api/visited', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        
        visitedIds.add(id);
        visitedIds = visitedIds; // trigger reactivity
        
        const loc = locations.find(l => l.id === id);
        const marker = markers[id];
        
        marker.setIcon(visitedIcon);
        marker.setPopupContent(createPopupContent(loc, true));
      } catch (err) {
        console.error('Error marking as visited:', err);
        alert('Failed to mark as visited.');
      }
    };
    
    await loadData();
    return () => {
      delete window.markVisited;
    };
  });
  
  async function loadData() {
    try {
      const locRes = await fetch('/api/locations');
      locations = await locRes.json();
  
      const visRes = await fetch('/api/visited');
      const visited = await visRes.json();
      visitedIds = new Set(visited);
  
      const pathRes = await fetch('/api/path');
      const pathData = await pathRes.json();
      gpsPath = pathData.map(p => [p.lat, p.lng]);
  
      renderLocations();
      renderPath();

      const setFallbackView = () => {
        const visitedLocs = locations.filter(l => visitedIds.has(l.id));
        if (visitedLocs.length > 0) {
          // Assume highest ID is latest visited if no timestamp is available
          const latestVisited = visitedLocs.reduce((prev, current) => (prev.id > current.id) ? prev : current);
          map.setView([latestVisited.lat, latestVisited.lng], 13);
        } else if (locations.length > 0) {
          const firstLoc = locations.reduce((prev, current) => (prev.id < current.id) ? prev : current);
          map.setView([firstLoc.lat, firstLoc.lng], 13);
        }
      };

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            map.setView([pos.coords.latitude, pos.coords.longitude], 13);
          },
          () => setFallbackView(),
          { timeout: 5000 }
        );
      } else {
        setFallbackView();
      }

      // Fetch images in the background without blocking initial render
      locations.forEach(async (loc, index) => {
        try {
          const wikiRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(loc.name)}`);
          if (wikiRes.ok) {
            const wikiData = await wikiRes.json();
            if (wikiData.thumbnail && wikiData.thumbnail.source) {
              locations[index].imageUrl = wikiData.thumbnail.source;
              locations = [...locations]; // trigger Svelte reactivity
              updateMarkerPopup(loc);
              return;
            }
          }
          
          const wdRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&generator=geosearch&ggsradius=100&ggscoord=${loc.lat}|${loc.lng}&prop=pageimages&pithumbsize=300&format=json&origin=*`);
          if (wdRes.ok) {
            const wdData = await wdRes.json();
            if (wdData.query && wdData.query.pages) {
              const pages = Object.values(wdData.query.pages);
              if (pages.length > 0 && pages[0].thumbnail) {
                locations[index].imageUrl = pages[0].thumbnail.source;
                locations = [...locations]; // trigger Svelte reactivity
                updateMarkerPopup(loc);
              }
            }
          }
        } catch(e) {}
      });
    } catch (err) {
      console.error('Error initializing:', err);
    }
  }

  function updateMarkerPopup(loc) {
    const marker = markers[loc.id];
    if (marker && marker.getPopup()) {
      marker.setPopupContent(createPopupContent(loc, visitedIds.has(loc.id)));
    }
  }
  
  function createPopupContent(loc, isVisited) {
    return `
      <div style="text-align: center; min-width: 120px;">
        ${loc.imageUrl ? `<img src="${loc.imageUrl}" alt="${loc.name}" style="width:100%; max-height:100px; object-fit:cover; border-radius:4px; margin-bottom:5px;" /><br>` : ''}
        <strong>${loc.name}</strong><br>
        ${isVisited 
          ? '<span style="color:#28a745;font-weight:bold;">✓ Visited</span>' 
          : `<button style="margin-top:5px;padding:4px;cursor:pointer;" onclick="window.markVisited(${loc.id})">Mark as Visited</button>`}
      </div>
    `;
  }
  
  function renderLocations() {
    locations.forEach(loc => {
      const isVisited = visitedIds.has(loc.id);
      const marker = L.marker([loc.lat, loc.lng], { icon: isVisited ? visitedIcon : defaultIcon })
        .addTo(map)
        .bindPopup(createPopupContent(loc, isVisited));
        
      markers[loc.id] = marker;
    });
  }
  
  function renderPath() {
    if (pathPolyline) {
      map.removeLayer(pathPolyline);
    }
    if (gpsPath.length > 0) {
      pathPolyline = L.polyline(gpsPath, { color: 'blue', weight: 4 }).addTo(map);
    }
  }
  
  function startTracking() {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    
    isTracking = true;
    gpsStatus = 'GPS: Acquiring signal...';
    
    watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy;
        
        gpsStatus = `GPS: Tracking (${accuracy.toFixed(1)}m accuracy)`;
        
        if (!currentPositionMarker) {
          currentPositionMarker = L.circleMarker([lat, lng], {
            radius: 8,
            fillColor: '#ff7800',
            color: '#000',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
          }).addTo(map);
          map.setView([lat, lng], 15);
        } else {
          currentPositionMarker.setLatLng([lat, lng]);
        }
        
        const lastPoint = gpsPath[gpsPath.length - 1];
        let shouldSave = true;
        if (lastPoint) {
          const dist = map.distance([lat, lng], lastPoint);
          if (dist < 5) shouldSave = false;
        }
        
        if (shouldSave) {
          gpsPath = [...gpsPath, [lat, lng]];
          renderPath();
          try {
            await fetch('/api/path', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lat, lng })
            });
          } catch(e) { console.error('Failed to save to DB', e) }
        }
      },
      (error) => {
        let msg = error.message || 'Unknown error';
        if (error.code === 1) msg = 'Permission denied.';
        else if (error.code === 2) msg = 'Position unavailable (Desktop PCs often lack location hardware).';
        else if (error.code === 3) msg = 'Timeout acquiring GPS signal.';
        
        gpsStatus = `GPS Error: ${msg}`;
        stopTracking();
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 27000 }
    );
  }
  
  function stopTracking() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    isTracking = false;
    gpsStatus = 'GPS: Stopped';
    if (currentPositionMarker) {
      map.removeLayer(currentPositionMarker);
      currentPositionMarker = null;
    }
  }
  
  async function findAttractions() {
    findingAttractions = true;
    try {
      const bounds = map.getBounds();
      const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
      const query = `[out:json][timeout:25];(node["tourism"="museum"](${bbox});node["historic"](${bbox});node["tourism"="attraction"](${bbox}););out;`;
      
      const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      const data = await res.json();
      
      data.elements.forEach(el => {
        if (el.lat && el.lon) {
          const name = (el.tags && el.tags.name) ? el.tags.name : 'Unknown Attraction';
          L.circleMarker([el.lat, el.lon], {
            radius: 6,
            fillColor: '#9c27b0',
            color: '#fff',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
          }).addTo(map).bindPopup(`<div><strong>${name}</strong><br><em>Nearby Attraction</em></div>`);
        }
      });
    } catch (err) {
      console.error('Failed to fetch attractions', err);
      alert('Failed to load attractions.');
    } finally {
      findingAttractions = false;
    }
  }

  function jumpToLocation(loc) {
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
    <button class="sidebar-toggle-btn" on:click={() => sidebarExpanded = !sidebarExpanded}>☰ Places</button>
    <h1 style="margin:0;">Trip Tracker</h1>
  </div>
  <div class="buttons">
    {#if !isTracking}
      <button class="btn" on:click={startTracking}>Start Tracking</button>
    {:else}
      <button class="btn stop" on:click={stopTracking}>Stop Tracking</button>
    {/if}
    <button class="btn" on:click={findAttractions} disabled={findingAttractions}>
      {findingAttractions ? 'Loading...' : 'Find Nearby Attractions'}
    </button>
    <a href="/edit" class="btn" style="text-decoration:none; background-color:#ffc107; color:black;">Edit Location Pins</a>
  </div>
  <div class="status">{gpsStatus}</div>
</div>

<div class="main-content">
  <div class="sidebar {sidebarExpanded ? 'expanded' : ''}">
    <div class="sidebar-header">
      Saved Locations
      <button class="sidebar-toggle-btn" on:click={() => sidebarExpanded = false}>✕</button>
    </div>
    {#each locations as loc}
      <!-- svelte-ignore a11y-click-events-have-key-events - we just want a simple clickable div -->
      <div class="location-item" on:click={() => jumpToLocation(loc)}>
        {#if loc.imageUrl}
          <img class="location-img-thumb" src="{loc.imageUrl}" alt="" />
        {:else}
          <div class="location-img-thumb" style="display:flex;align-items:center;justify-content:center;color:#999;font-size:0.7em;">No Img</div>
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
      <div style="padding:15px; color:#666; text-align:center;">No locations saved yet.</div>
    {/if}
  </div>

  <div class="map" bind:this={mapContainer} on:click={() => sidebarExpanded = false}></div>
</div>