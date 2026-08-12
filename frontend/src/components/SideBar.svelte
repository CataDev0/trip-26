<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { get } from "svelte/store";
    import {
        ArrowUpDown,
        ChevronLeft,
        Download,
        Eye,
        MapPin,
        Navigation,
        Pencil,
        Plus,
        RotateCcw,
        Search,
        Share2,
        Trash2,
        X,
    } from "lucide-svelte";
    import { highlightedTripIds, selectedTripIds, trashedTrips, trips, type Trip } from "../stores/tripStore";
    import {
        createTrip,
        exportTrips,
        fetchTrips,
        formatDate,
        purgeTrips,
        renameTrip,
        restoreTrips,
        trashTrips,
    } from "../helpers/trips";

    export let sidebarExpanded: boolean = false;

    const dispatch = createEventDispatcher<{
        showTrip: number;
        showTrips: number[];
        routeGuidance: number;
    }>();

    type SortMode = "newest" | "oldest" | "name-asc" | "name-desc";

    let searchQuery: string = "";
    let sortMode: SortMode = "newest";
    let showTrash: boolean = false;
    let tripsError: boolean = false;

    const SORT_MODES: { mode: SortMode; label: string }[] = [
        { mode: "newest", label: "Newest" },
        { mode: "oldest", label: "Oldest" },
        { mode: "name-asc", label: "A → Z" },
        { mode: "name-desc", label: "Z → A" },
    ];

    const tripName = (trip: Trip): string => trip.name || `New Trip ${shortDate(trip.started_at)}`;

    function shortDate(isoString?: string | null): string {
        if (!isoString) return "";
        const d = new Date(isoString);
        if (Number.isNaN(d.getTime())) return "";
        return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }

    function computeFilteredTrips(allTrips: Trip[], query: string, mode: SortMode): Trip[] {
        let list = allTrips;
        const trimmed = query.trim().toLowerCase();
        if (trimmed) {
            list = list.filter((t) => tripName(t).toLowerCase().includes(trimmed));
        }
        const sorted = [...list];
        const byDate = (a: Trip, b: Trip) =>
            (a.started_at ?? "").localeCompare(b.started_at ?? "");
        switch (mode) {
            case "oldest":
                sorted.sort(byDate);
                break;
            case "name-asc":
                sorted.sort((a, b) => tripName(a).localeCompare(tripName(b)));
                break;
            case "name-desc":
                sorted.sort((a, b) => tripName(b).localeCompare(tripName(a)));
                break;
            default:
                sorted.sort((a, b) => byDate(b, a));
        }
        return sorted;
    }

    $: filteredTrips = computeFilteredTrips($trips, searchQuery, sortMode);

    async function loadTrips() {
        try {
            await fetchTrips();
            tripsError = false;
        } catch (err) {
            console.error("Failed to load trips", err);
            tripsError = true;
        }
    }

    onMount(() => {
        loadTrips();
    });

    function cycleSort() {
        const index = SORT_MODES.findIndex((s) => s.mode === sortMode);
        sortMode = SORT_MODES[(index + 1) % SORT_MODES.length].mode;
    }

    function toggleSelect(id: number) {
        selectedTripIds.update((set) => {
            const next = new Set(set);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }

    function clearSelection() {
        selectedTripIds.set(new Set());
    }

    function showSelectedOnMap() {
        dispatch("showTrips", [...get(selectedTripIds)]);
    }

    async function removeSelected() {
        const ids = [...get(selectedTripIds)];
        if (ids.length === 0) return;
        if (!confirm(`Move ${ids.length} selected trip(s) to the trash?`)) return;
        try {
            await trashTrips(ids);
            clearSelection();
        } catch (err) {
            console.error("Failed to remove trips", err);
            alert("Failed to remove trips.");
        }
    }

    async function addNewTrip() {
        const defaultName = `New Trip ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
        const name = prompt("New trip name:", defaultName);
        if (name === null) return;
        try {
            await createTrip(name.trim() || defaultName);
        } catch (err) {
            console.error("Failed to create trip", err);
            alert("Failed to create trip.");
        }
    }

    async function editTrip(trip: Trip) {
        const name = prompt("Rename trip:", tripName(trip));
        if (name === null || name.trim() === "" || name.trim() === tripName(trip)) return;
        try {
            await renameTrip(trip.id, name.trim());
        } catch (err) {
            console.error("Failed to rename trip", err);
            alert("Failed to rename trip.");
        }
    }

    async function shareTrip(trip: Trip) {
        const text =
            `Trip: ${tripName(trip)}\n` +
            `${formatDate(trip.started_at)} → ${formatDate(trip.ended_at)}\n` +
            `${trip.point_count ?? 0} GPS points`;
        const url = window.location.href;

        if (navigator.share) {
            try {
                await navigator.share({ title: "Trip Tracker", text, url });
            } catch {
                // User cancelled the share sheet
            }
        } else {
            try {
                await navigator.clipboard.writeText(`${text}\n${url}`);
                alert("Trip details copied to clipboard.");
            } catch {
                alert(text);
            }
        }
    }

    async function exportAllTrips() {
        try {
            await exportTrips();
        } catch (err) {
            console.error("Failed to export trips", err);
            alert("Failed to export trips.");
        }
    }

    async function restoreTrip(trip: Trip) {
        try {
            await restoreTrips([trip.id]);
        } catch (err) {
            console.error("Failed to restore trip", err);
            alert("Failed to restore trip.");
        }
    }

    async function deleteTripForever(trip: Trip) {
        if (!confirm(`Permanently delete "${tripName(trip)}"? This cannot be undone.`)) return;
        try {
            await purgeTrips([trip.id]);
        } catch (err) {
            console.error("Failed to delete trip", err);
            alert("Failed to delete trip.");
        }
    }
</script>

<div class="sidebar {sidebarExpanded ? "expanded" : ""}">
    {#if !showTrash}
        <div class="sidebar-header">
            Trips
            <button
                class="sidebar-toggle-btn"
                on:click={() => (sidebarExpanded = false)}>✕</button
            >
        </div>

        <div class="trip-search-row">
            <div class="trip-search">
                <Search size="14" />
                <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder="Search trips..."
                />
            </div>
            <button
                class="sort-btn"
                title="Sort trips"
                on:click={cycleSort}>{SORT_MODES.find((s) => s.mode === sortMode)?.label}<ArrowUpDown size="14" /></button
            >
        </div>

        {#if $selectedTripIds.size > 0}
            <div class="selection-toolbar">
                <button class="btn btn-sm" on:click={showSelectedOnMap}>
                    <Eye size="14" /> Show selected
                </button>
                <button class="btn btn-sm btn-secondary" on:click={clearSelection}>
                    <X size="14" /> Clear
                </button>
                <button class="btn btn-sm btn-danger" on:click={removeSelected}>
                    <Trash2 size="14" /> Remove
                </button>
            </div>
        {/if}

        <div class="trip-list">
            {#each filteredTrips as trip (trip.id)}
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div
                    class="trip-item {$selectedTripIds.has(trip.id) ? "selected" : ""} {$highlightedTripIds.includes(trip.id) ? "highlighted" : ""}"
                    on:click={() => toggleSelect(trip.id)}
                >
                    <input
                        type="checkbox"
                        checked={$selectedTripIds.has(trip.id)}
                        on:click|stopPropagation={() => toggleSelect(trip.id)}
                    />
                    <div class="trip-info">
                        <div class="trip-name">{tripName(trip)}</div>
                        <div class="trip-meta">
                            {formatDate(trip.started_at)}
                            {#if (trip.point_count ?? 0) > 0}
                                · {trip.point_count} pts
                            {/if}
                        </div>
                    </div>
                    {#if $highlightedTripIds.includes(trip.id)}
                        <span class="highlight-badge" title="Highlighted on map">On map</span>
                    {/if}
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div class="trip-actions" on:click|stopPropagation>
                        <button title="Show on map" on:click={() => dispatch("showTrip", trip.id)}>
                            <MapPin size="14" />
                        </button>
                        <button title="Share" on:click={() => shareTrip(trip)}>
                            <Share2 size="14" />
                        </button>
                        <button title="Edit" on:click={() => editTrip(trip)}>
                            <Pencil size="14" />
                        </button>
                        <button
                            title="Route guidance"
                            on:click={() => dispatch("routeGuidance", trip.id)}
                        >
                            <Navigation size="14" />
                        </button>
                    </div>
                </div>
            {/each}
            {#if tripsError}
                <div class="sidebar-empty">
                    Failed to load trips — is the server running?
                    <button class="btn btn-sm" on:click={loadTrips} style="margin-top:8px;">Retry</button>
                </div>
            {:else if filteredTrips.length === 0}
                <div class="sidebar-empty">
                    {searchQuery ? "No trips match your search." : "No trips yet."}
                </div>
            {/if}
        </div>

        <div class="sidebar-footer">
            <button class="btn btn-sm" on:click={addNewTrip}>
                <Plus size="14" /> Add new trip
            </button>
            <button class="btn btn-sm btn-secondary" on:click={exportAllTrips}>
                <Download size="14" /> Export trips
            </button>
            <button class="btn btn-sm btn-secondary" on:click={() => (showTrash = true)}>
                <Trash2 size="14" /> Trash bin
            </button>
        </div>
    {:else}
        <div class="sidebar-header">
            <button class="back-btn" on:click={() => (showTrash = false)}>
                <ChevronLeft size="16" /> Trips
            </button>
            <button
                class="sidebar-toggle-btn"
                on:click={() => (sidebarExpanded = false)}>✕</button
            >
        </div>

        <div class="trip-list">
            {#each $trashedTrips as trip (trip.id)}
                <div class="trip-item">
                    <div class="trip-info">
                        <div class="trip-name">{tripName(trip)}</div>
                        <div class="trip-meta">{formatDate(trip.deleted_at)} · trashed</div>
                    </div>
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div class="trip-actions" on:click|stopPropagation>
                        <button title="Restore" on:click={() => restoreTrip(trip)}>
                            <RotateCcw size="14" />
                        </button>
                        <button
                            class="danger"
                            title="Delete permanently"
                            on:click={() => deleteTripForever(trip)}
                        >
                            <Trash2 size="14" />
                        </button>
                    </div>
                </div>
            {/each}
            {#if $trashedTrips.length === 0}
                <div class="sidebar-empty">Trash bin is empty.</div>
            {/if}
        </div>
    {/if}
</div>
