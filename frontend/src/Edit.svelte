<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  
  import TopBar from "./components/TopBar.svelte";
  import { MapEditor } from "./helpers/edit";
  import { getAuthHeader } from "./helpers/auth";
  import { getSharedMap } from "./helpers/sharedMap";
  import { canSaveLocations } from "./stores/editStore";
  import { isSpliceMode, spliceEndPt, spliceStartPt } from "./stores/editStore";

  let editor: MapEditor;
  let mapWrapper: HTMLDivElement;

  onMount(async () => {
      const { map, container } = getSharedMap();
      editor = new MapEditor(map);
      // eslint-disable-next-line svelte/no-dom-manipulating -- the shared map container is adopted into this view by design
      mapWrapper.appendChild(container);

      // Enable save buttons in edit view
      canSaveLocations.update(() => true);

      const authHeader = getAuthHeader();
      if (!(await authHeader).Authorization) {
          // No auth, show login modal
          window.dispatchEvent(new CustomEvent("require-login"));
      }
  });

  // The map is a singleton that persists across views — Geoman controls and
  // listeners must be torn down on exit (Svelte ignores onMount return values)
  onDestroy(() => {
      editor?.dispose();
  });
</script>

<TopBar
  title="Edit Mode"
  showVisitorCount={false}
  statusText="Use the Geoman toolbar to draw shapes or edit paths."
>
  <svelte:fragment slot="buttons">
    {#if $isSpliceMode && $spliceStartPt && $spliceEndPt}
        <button
          class="btn"
          style="background-color: #dc3545; margin-right: 5px;"
          on:click={() => editor.executeSplice(editor.map.getBounds())}
        >
          Execute Splice
        </button>
    {/if}

    <button
      class="btn"
      style="background-color: {$isSpliceMode
          ? "#17a2b8"
          : "#6f42c1"}; margin-right: 5px;"
      on:click={() => editor?.toggleSpliceMode()}
    >
      {$isSpliceMode ? "Cancel Splice" : "Splice Mode"}
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
