<script lang="ts">
  import { onMount } from "svelte";
  import "@geoman-io/leaflet-geoman-free";
  import TopBar from "./components/TopBar.svelte";
  import { MapEditor } from "./helpers/edit";
  import { getAuthHeader } from "./helpers/auth";
  import { getSharedMap } from "./helpers/sharedMap";

  let editor: MapEditor;
  let mapWrapper: HTMLDivElement;

  onMount(async () => {
      const { map, container } = getSharedMap();
      editor = new MapEditor(map);
      mapWrapper.appendChild(container);

      editor.map.pm.addControls({
          cutPolygon: true,
          dragMode: true,
          drawCircle: false,
          drawCircleMarker: false,
          drawMarker: true,
          drawPolygon: true,
          drawPolyline: false,
          drawRectangle: true,
          editControls: true,
          editMode: true,
          position: "topleft",
          removalMode: true,
          rotateMode: false,
      });

      const authHeader = getAuthHeader();
      if (!(await authHeader).Authorization) {
      // No auth, show login modal
          window.dispatchEvent(new CustomEvent("require-login"));
      }
  });

  $: spliceMode = editor?.isSpliceMode;
  $: spliceStartPt = editor?.spliceStartPt;
  $: spliceEndPt = editor?.spliceEndPt;
</script>

<TopBar
  title="Edit Mode"
  showVisitorCount={false}
  statusText="Use the Geoman toolbar to draw shapes or edit paths."
>
  <svelte:fragment slot="buttons">
    {#if $spliceMode}
      <span
        style="background: #fff; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-right: 10px;"
      >
        A: {$spliceStartPt
            ? `${$spliceStartPt.lat.toFixed(4)}, ${$spliceStartPt.lng.toFixed(4)}`
            : "..."} | B: {$spliceEndPt
                ? `${$spliceEndPt.lat.toFixed(4)}, ${$spliceEndPt.lng.toFixed(4)}`
                : "..."}
      </span>

      {#if $spliceStartPt && $spliceEndPt}
        <button
          class="btn"
          style="background-color: #dc3545; margin-right: 5px;"
          on:click={() => editor.executeSplice()}
        >
          Execute Splice
        </button>
      {/if}
    {/if}

    <button
      class="btn"
      style="background-color: {$spliceMode
          ? "#17a2b8"
          : "#6f42c1"}; margin-right: 5px;"
      on:click={() => editor?.toggleSpliceMode()}
    >
      {$spliceMode ? "Cancel Splice" : "Splice Mode"}
    </button>

    <button
      class="btn"
      style="background-color: #28a745;"
      on:click={() => editor.saveLocations()}
    >
      Save Location Pins
    </button>
    <button
      class="btn"
      style="background-color: #007bff;"
      on:click={() => editor.saveTraces()}
    >
      Save GPS Traces
    </button>
    <a
      href="/suite"
      class="btn"
      style="text-decoration:none; background-color: #6c757d;"
    >
      Back
    </a>
  </svelte:fragment>
</TopBar>
<div class="map" bind:this={mapWrapper}></div>
