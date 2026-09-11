<script lang="ts">
    import type { Readable } from "svelte/store";
    import { Check, Folder, MapPin } from "lucide-svelte";
    import type { Cluster, Trip } from "../stores/tripStore";

    export let clusters: Readable<Cluster[]>;
    export let trips: Readable<Trip[]>;
    export let currentTripId: number | null;
    export let tripLabel: (trip: Trip) => string = () => "";
    export let onChoose: (tripId: number | null) => void = () => {};
    export let onCancel: () => void = () => {};

    // Trips not in any group — including orphans whose group is unknown
    $: ungroupedTrips = $trips.filter(
        (t) => t.cluster_id == null || !$clusters.some((c) => c.id === t.cluster_id),
    );
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="modal" on:click|self={onCancel}>
    <div class="modal-content">
        <h3>Associate with trip</h3>
        {#each $clusters as cluster (cluster.id)}
            {@const members = $trips.filter((t) => t.cluster_id === cluster.id)}
            {#if members.length > 0}
                <div class="group-header">
                    <Folder size="14" /> {cluster.name ?? "Unnamed group"}
                </div>
                {#each members as trip (trip.id)}
                    <button class="trip-option" on:click={() => onChoose(trip.id)}>
                        <MapPin size="14" /> {tripLabel(trip)}
                        {#if trip.id === currentTripId}<span class="check-icon"><Check size="14" /></span>{/if}
                    </button>
                {/each}
            {/if}
        {/each}
        {#if ungroupedTrips.length > 0}
            <div class="group-header">Ungrouped</div>
            {#each ungroupedTrips as trip (trip.id)}
                <button class="trip-option" on:click={() => onChoose(trip.id)}>
                    <MapPin size="14" /> {tripLabel(trip)}
                    {#if trip.id === currentTripId}<span class="check-icon"><Check size="14" /></span>{/if}
                </button>
            {/each}
        {/if}
        <button class="trip-option" on:click={() => onChoose(null)}>
            No trip
            {#if currentTripId === null}<span class="check-icon"><Check size="14" /></span>{/if}
        </button>
        <button class="trip-option trip-cancel" on:click={onCancel}>Cancel</button>
    </div>
</div>

<style>
    .modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
    }

    .modal-content {
        background: white;
        padding: 20px;
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        width: 300px;
        max-width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        color: black;
        font-family: sans-serif;
    }

    .modal-content h3 {
        margin: 0 0 6px 0;
    }

    .group-header {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        font-size: 0.8rem;
        font-weight: bold;
        color: #555;
        text-transform: uppercase;
    }

    .trip-option {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        padding: 8px 10px;
        background: #f1f3f5;
        border: none;
        border-radius: 6px;
        font-size: 0.9rem;
        cursor: pointer;
    }

    .trip-option:hover {
        background: #e2e6ea;
    }

    .check-icon {
        display: flex;
        margin-left: auto;
        color: #28a745;
    }

    .trip-cancel {
        background: transparent;
        justify-content: center;
        color: #555;
    }
</style>
