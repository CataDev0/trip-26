<script lang="ts">
  import { onMount } from "svelte";
  import "@geoman-io/leaflet-geoman-free";
  import { getSharedMap } from "./sharedMap";
  import TopBar from "./TopBar.svelte";
  import { MapEditor } from "./edit";

  let editor: MapEditor;
  let isSpliceMode = false;

  onMount(async () => {
    const { map, container } = getSharedMap();
    editor = new MapEditor(map, container);
    editor.mapContainer.appendChild(container);
  });
</script>

<TopBar title="Edit Mode" showVisitorCount={false} statusText="Use the Geoman toolbar to draw shapes or edit paths.">
  <svelte:fragment slot="buttons">
  {#if isSpliceMode}
      <span style="background: #fff; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-right: 10px;">
        A: {editor.spliceStartPt ? `${editor.spliceStartPt.lat.toFixed(4)}, ${editor.spliceStartPt.lng.toFixed(4)}` : '...'} | 
        B: {editor.spliceEndPt ? `${editor.spliceEndPt.lat.toFixed(4)}, ${editor.spliceEndPt.lng.toFixed(4)}` : '...'}
      </span>

      {#if editor.spliceStartPt && editor.spliceEndPt}
        <button class="btn" style="background-color: #dc3545; margin-right: 5px;" on:click={editor.executeSplice}>
          Execute Splice
        </button>
      {/if}
    {/if}

    <button class="btn" style="background-color: {isSpliceMode ? '#17a2b8' : '#6f42c1'}; margin-right: 5px;" on:click={editor.toggleSpliceMode}>
      {isSpliceMode ? 'Cancel Splice' : 'Splice Mode'}
    </button>
  
  <button class="btn" style="background-color: #28a745;" on:click={editor.saveLocations}>
      Save Location Pins
    </button>
    <button class="btn" style="background-color: #007bff;" on:click={editor.saveTraces}>
      Save GPS Traces
    </button>
    <a href="/suite" class="btn" style="text-decoration:none; background-color: #6c757d;">
      Back
    </a>
  </svelte:fragment>
</TopBar>

<div class="map" bind:this={editor.mapContainer}></div>
