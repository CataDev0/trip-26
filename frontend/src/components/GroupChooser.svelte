<script lang="ts">
    import type { Readable } from "svelte/store";
    import { Folder } from "lucide-svelte";
    import type { Cluster } from "../stores/tripStore";

    export let clusters: Readable<Cluster[]>;
    export let onChoose: (clusterId: number | null) => void = () => {};
    export let onCreate: (name: string) => void = () => {};
    export let onCancel: () => void = () => {};

    let newGroupName = "";
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="modal" on:click|self={onCancel}>
    <div class="modal-content">
        <h3>Add to group</h3>
        {#each $clusters as cluster (cluster.id)}
            <button class="group-option" on:click={() => onChoose(cluster.id)}>
                <Folder size="14" /> {cluster.name ?? "Unnamed group"}
            </button>
        {/each}
        <div class="new-group-row">
            <input placeholder="New group name..." bind:value={newGroupName} />
            <button class="btn btn-sm" on:click={() => onCreate(newGroupName.trim() || "New Group")}>Create</button>
        </div>
        <button class="group-option" on:click={() => onChoose(null)}>Ungroup</button>
        <button class="group-option group-cancel" on:click={onCancel}>Cancel</button>
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
        gap: 10px;
        width: 300px;
        max-width: 90%;
        color: black;
        font-family: sans-serif;
    }

    .modal-content h3 {
        margin: 0;
    }

    .group-option {
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

    .group-option:hover {
        background: #e2e6ea;
    }

    .group-cancel {
        background: transparent;
        justify-content: center;
        color: #555;
    }

    .new-group-row {
        display: flex;
        gap: 6px;
    }

    .new-group-row input {
        flex-grow: 1;
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 6px;
        font-size: 0.9rem;
    }
</style>
