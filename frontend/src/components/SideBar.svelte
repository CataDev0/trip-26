<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import {
        locations,
        visitedIds,
    } from "../helpers/locationMarkers";
    import type { LocationData } from "../helpers/mapData";

    export let sidebarExpanded: boolean = false;
    const dispatch = createEventDispatcher<{ jump: LocationData }>();

    function jumpToLocation(loc: LocationData) {
        dispatch("jump", loc);
    }
</script>

<div class="sidebar {sidebarExpanded ? "expanded" : ""}">
    <div class="sidebar-header">
        Saved Locations
        <button
            class="sidebar-toggle-btn"
            on:click={() => (sidebarExpanded = false)}>✕</button
        >
    </div>
    {#each $locations as loc (loc.id)}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
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
                {#if $visitedIds.has(loc.id)}
                    <div class="location-visited">✓ Visited</div>
                {/if}
            </div>
        </div>
    {/each}
    {#if $locations.length === 0}
        <div style="padding:15px; color:#666; text-align:center;">
            No locations saved yet.
        </div>
    {/if}
</div>
