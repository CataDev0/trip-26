<script lang="ts">
  import { onMount } from "svelte";
  import TopBar from "./components/TopBar.svelte";
  import { type LeafletWindow, MapEditor } from "./helpers/edit";
  import { getAuthHeader } from "./helpers/auth";
  import { getSharedMap } from "./helpers/sharedMap";
  import { canSaveLocations, locations } from "./stores/editStore";
  import { isSpliceMode, spliceEndPt, spliceStartPt } from "./stores/editStore";
  import { get } from "svelte/store";
  
  let editor: MapEditor;
  let mapWrapper: HTMLDivElement;

  onMount(async () => {
      const { map, container } = getSharedMap();
      editor = new MapEditor(map);
      mapWrapper.appendChild(container);

      // Enable save buttons in edit view
      canSaveLocations.update(() => true); 

      // Global hooks inside popup HTML snippets
      (window as LeafletWindow).editLocName = (id: number, newName: string) => editor.editLocName(id, newName);
      (window as LeafletWindow).deleteLoc = (id: number) => editor.deleteLoc(id);
      (window as LeafletWindow).saveLocation = (id: number) => {
          const loc = get(locations)[id];
          editor.saveLocation(loc);
      }
      const authHeader = getAuthHeader();
      if (!(await authHeader).Authorization) {
          // No auth, show login modal
          window.dispatchEvent(new CustomEvent("require-login"));
      }

      return () => {
          delete (window as LeafletWindow).editLocName;
          delete (window as LeafletWindow).deleteLoc;
          delete (window as LeafletWindow).saveLocation;
          if (map) {
              map.off("pm:create");
              map.off("pm:remove");
              map.pm.removeControls();
              map.pm.disableDraw();
              if (editor.pathLayerGroup) map.removeLayer(editor.pathLayerGroup);
          }
      };
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
