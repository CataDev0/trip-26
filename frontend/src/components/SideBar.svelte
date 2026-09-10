<script lang="ts">
    import { createEventDispatcher, onDestroy, onMount } from "svelte";
    import { get } from "svelte/store";
    import {
        ArrowUpDown,
        Check,
        ChevronDown,
        ChevronLeft,
        ChevronRight,
        Download,
        Eye,
        EyeOff,
        Folder,
        FolderPlus,
        MapPin,
        MenuIcon,
        Navigation,
        Pencil,
        Plus,
        RotateCcw,
        Search,
        Share2,
        Trash2,
        X,
    } from "lucide-svelte";
    import {
        clusters,
        highlightedTripIds,
        selectedTripIds,
        trashedTrips,
        trips,
        type Cluster,
        type Trip,
    } from "../stores/tripStore";
    import {
        createTrip,
        exportTrips,
        fetchTrips,
        formatDate,
        purgeTrips,
        renameTrip,
        restoreTrips,
        setTripHidden,
        trashTrips,
    } from "../helpers/trips";
    import { locations, visitedIds, markVisited } from "../helpers/locationMarkers";
    import {
        assignTripsToCluster,
        createCluster,
        deleteCluster,
        fetchClusters,
        renameCluster,
        setClusterHidden,
    } from "../helpers/clusters";
    import { clearAuth, isLoggedIn } from "../helpers/auth";
    import GroupChooser from "./GroupChooser.svelte";

    export let sidebarExpanded: boolean = false;

    const dispatch = createEventDispatcher<{
        showTrip: number;
        showTrips: number[];
        routeGuidance: number;
    }>();

    type SortMode = "newest" | "oldest" | "name-asc" | "name-desc";

    $: visitedLocationIds = get(visitedIds);

    let searchQuery: string = "";
    let sortMode: SortMode = "newest";
    let showTrash: boolean = false;
    let tripsError: boolean = false;
    let hasAuth: boolean = false;

    // Groups default to expanded; only collapsed ids are tracked
    let collapsedClusters: Set<number> = new Set();
    let ungroupedExpanded: boolean = true;
    type ChooserMode = { mode: "selected" } | { mode: "trip"; tripId: number };
    let chooserMode: ChooserMode | null = null;
    let chooserComponent: GroupChooser | null = null;

    const SORT_MODES: { mode: SortMode; label: string }[] = [
        { mode: "newest", label: "Newest" },
        { mode: "oldest", label: "Oldest" },
        { mode: "name-asc", label: "A → Z" },
        { mode: "name-desc", label: "Z → A" },
    ];

    const tripName = (trip: Trip): string =>
        trip.name || `New Trip ${shortDate(trip.started_at)}`;

    function shortDate(isoString?: string | null): string {
        if (!isoString) return "";
        const d = new Date(isoString);
        if (Number.isNaN(d.getTime())) return "";
        return d.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
        });
    }

    function computeFilteredTrips(
        allTrips: Trip[],
        query: string,
        mode: SortMode,
    ): Trip[] {
        let list = allTrips;
        const trimmed = query.trim().toLowerCase();
        if (trimmed) {
            list = list.filter((t) =>
                tripName(t).toLowerCase().includes(trimmed),
            );
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

    type DisplayItem =
        | { kind: "cluster"; cluster: Cluster | null; members: Trip[] }
        | { kind: "trip"; trip: Trip; groupHidden: boolean };

    function buildDisplayList(
        clusterList: Cluster[],
        tripList: Trip[],
        query: string,
        authed: boolean,
        collapsed: Set<number>,
        ungroupedOpen: boolean,
    ): DisplayItem[] {
        const items: DisplayItem[] = [];
        const searching = query.trim().length > 0;
        const knownClusterIds = new Set(clusterList.map((c) => c.id));
        for (const cluster of clusterList) {
            const members = tripList.filter((t) => t.cluster_id === cluster.id);
            if (members.length === 0 && (searching || !authed)) continue;
            items.push({ kind: "cluster", cluster, members });
            if (!collapsed.has(cluster.id)) {
                for (const trip of members) {
                    items.push({
                        kind: "trip",
                        trip,
                        groupHidden: !!cluster.hidden,
                    });
                }
            }
        }
        // Trips not in any group — including orphans whose group is unknown
        const ungrouped = tripList.filter(
            (t) => t.cluster_id == null || !knownClusterIds.has(t.cluster_id),
        );
        if (ungrouped.length > 0) {
            items.push({ kind: "cluster", cluster: null, members: ungrouped });
            if (ungroupedOpen) {
                for (const trip of ungrouped) {
                    items.push({ kind: "trip", trip, groupHidden: false });
                }
            }
        }
        return items;
    }

    $: displayItems = buildDisplayList(
        $clusters,
        filteredTrips,
        searchQuery,
        hasAuth,
        collapsedClusters,
        ungroupedExpanded,
    );

    async function loadTrips() {
        try {
            await Promise.all([fetchTrips(), fetchClusters()]);
            tripsError = false;
        } catch (err) {
            console.error("Failed to load trips", err);
            tripsError = true;
        }
    }

    onMount(() => {
        loadTrips();
        isLoggedIn().then((loggedIn: boolean) => (hasAuth = loggedIn));
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
        if (!confirm(`Move ${ids.length} selected trip(s) to the trash?`))
            return;
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
        if (
            name === null ||
            name.trim() === "" ||
            name.trim() === tripName(trip)
        )
            return;
        try {
            await renameTrip(trip.id, name.trim());
        } catch (err) {
            console.error("Failed to rename trip", err);
            alert("Failed to rename trip.");
        }
    }

    async function toggleHidden(trip: Trip) {
        try {
            await setTripHidden(trip.id, !trip.hidden);
        } catch (err) {
            console.error("Failed to update trip visibility", err);
            alert("Failed to update trip visibility.");
        }
    }

    async function addNewCluster() {
        const name = prompt("New group name:", "New Group");
        if (name === null || name.trim() === "") return;
        try {
            await createCluster(name.trim());
        } catch (err) {
            console.error("Failed to create group", err);
            alert("Failed to create group.");
        }
    }

    async function editCluster(cluster: Cluster) {
        const current = cluster.name ?? "";
        const name = prompt("Rename group:", current);
        if (name === null || name.trim() === "" || name.trim() === current)
            return;
        try {
            await renameCluster(cluster.id, name.trim());
        } catch (err) {
            console.error("Failed to rename group", err);
            alert("Failed to rename group.");
        }
    }

    async function removeCluster(cluster: Cluster) {
        if (
            !confirm(
                `Delete group "${cluster.name ?? "Unnamed group"}"? Its trips will be ungrouped but not deleted.`,
            )
        )
            return;
        try {
            await deleteCluster(cluster.id);
        } catch (err) {
            console.error("Failed to delete group", err);
            alert("Failed to delete group.");
        }
    }

    async function toggleClusterHidden(cluster: Cluster) {
        try {
            await setClusterHidden(cluster.id, !cluster.hidden);
        } catch (err) {
            console.error("Failed to update group visibility", err);
            alert("Failed to update group visibility.");
        }
    }

    function toggleCluster(id: number) {
        const next = new Set(collapsedClusters);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        collapsedClusters = next;
    }

    // Mounts the group chooser into document.body — the sidebar's mobile
    // transform/overflow would break a position: fixed modal inside it
    function openChooser(mode: ChooserMode) {
        chooserMode = mode;
        chooserComponent?.$destroy();
        chooserComponent = new GroupChooser({
            target: document.body,
            props: {
                clusters,
                onChoose: handleChoose,
                onCreate: handleCreateAndAssign,
                onCancel: closeChooser,
            },
        });
    }

    function closeChooser() {
        chooserComponent?.$destroy();
        chooserComponent = null;
        chooserMode = null;
    }

    function chooserTargets(mode: ChooserMode): {
        ids: number[];
        clearAfter: boolean;
    } {
        return mode.mode === "selected"
            ? { ids: [...get(selectedTripIds)], clearAfter: true }
            : { ids: [mode.tripId], clearAfter: false };
    }

    async function handleChoose(clusterId: number | null) {
        const mode = chooserMode;
        if (!mode) return;
        const { ids, clearAfter } = chooserTargets(mode);
        closeChooser();
        try {
            await assignTripsToCluster(ids, clusterId);
            if (clearAfter) clearSelection();
        } catch (err) {
            console.error("Failed to assign trips to group", err);
            alert("Failed to assign trips to group.");
        }
    }

    async function handleCreateAndAssign(name: string) {
        const mode = chooserMode;
        if (!mode) return;
        const { ids, clearAfter } = chooserTargets(mode);
        closeChooser();
        try {
            const id = await createCluster(name);
            await assignTripsToCluster(ids, id);
            if (clearAfter) clearSelection();
        } catch (err) {
            console.error("Failed to create group", err);
            alert("Failed to create group.");
        }
    }

    onDestroy(() => {
        chooserComponent?.$destroy();
    });

    // Remove stored credentials, stop sending Auth header
    // then refresh to the public dataset
    async function logout() {
        await clearAuth();
        hasAuth = false;
        await loadTrips();
        window.dispatchEvent(new CustomEvent("logged-out"));
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
        if (
            !confirm(
                `Permanently delete "${tripName(trip)}"? This cannot be undone.`,
            )
        )
            return;
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
            {#if hasAuth}
                <span
                    class="hidden-trips-indicator"
                    title="Hidden trips are visible to you because you are logged in."
                >
                    Logged in <button
                        class="btn btn-sm btn-secondary"
                        on:click={logout}>Log out</button
                    >
                </span>
            {/if}
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
            <button class="sort-btn" title="Sort trips" on:click={cycleSort}
                >{SORT_MODES.find((s) => s.mode === sortMode)
                    ?.label}<ArrowUpDown size="14" /></button
            >
        </div>

        {#if $selectedTripIds.size > 0}
            <div class="selection-toolbar">
                <button class="btn btn-sm" on:click={showSelectedOnMap}>
                    <Eye size="14" /> Show selected
                </button>
                <button
                    class="btn btn-sm btn-secondary"
                    on:click={clearSelection}
                >
                    <X size="14" /> Clear
                </button>
                <button class="btn btn-sm btn-danger" on:click={removeSelected}>
                    <Trash2 size="14" /> Remove
                </button>
                {#if hasAuth}
                    <button
                        class="btn btn-sm btn-secondary"
                        on:click={() => openChooser({ mode: "selected" })}
                    >
                        <FolderPlus size="14" /> Add to group
                    </button>
                {/if}
            </div>
        {/if}

        <div class="trip-list">
            {#each displayItems as item (item.kind === "cluster" ? `c${item.cluster?.id ?? "u"}` : `t${item.trip.id}`)}
                {#if item.kind === "cluster"}
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div
                        class="cluster-header"
                        on:click={() =>
                            item.cluster
                                ? toggleCluster(item.cluster.id)
                                : (ungroupedExpanded = !ungroupedExpanded)}
                    >
                        {#if item.cluster ? !collapsedClusters.has(item.cluster.id) : ungroupedExpanded}
                            <ChevronDown size="14" />
                        {:else}
                            <ChevronRight size="14" />
                        {/if}
                        {#if item.cluster}<Folder size="14" />{/if}
                        <span class="cluster-name"
                            >{item.cluster?.name ?? "Ungrouped"}</span
                        >
                        <span class="cluster-count">{item.members.length}</span>
                        {#if item.cluster?.hidden}
                            <span title="Hidden from public">
                                <EyeOff
                                    size="12"
                                    style="vertical-align: -2px; color: #ff8c00;"
                                />
                            </span>
                        {/if}
                        {#if item.cluster}
                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                            <!-- svelte-ignore a11y-no-static-element-interactions -->
                            <div class="trip-actions" on:click|stopPropagation>
                                <button
                                    title="Show group on map"
                                    on:click={() =>
                                        dispatch(
                                            "showTrips",
                                            item.members.map((t) => t.id),
                                        )}
                                >
                                    <MapPin size="14" />
                                </button>
                                {#if hasAuth}
                                    <button
                                        title={item.cluster.hidden
                                            ? "Show publicly"
                                            : "Hide from public"}
                                        on:click={() =>
                                            item.cluster &&
                                            toggleClusterHidden(item.cluster)}
                                    >
                                        {#if item.cluster.hidden}
                                            <EyeOff color="red" size="14" />
                                        {:else}
                                            <Eye size="14" />
                                        {/if}
                                    </button>
                                    <button
                                        title="Rename group"
                                        on:click={() =>
                                            item.cluster &&
                                            editCluster(item.cluster)}
                                    >
                                        <Pencil size="14" />
                                    </button>
                                    <button
                                        title="Delete group"
                                        on:click={() =>
                                            item.cluster &&
                                            removeCluster(item.cluster)}
                                    >
                                        <Trash2 size="14" />
                                    </button>
                                {/if}
                            </div>
                        {/if}
                    </div>
                {:else}
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div
                        class="trip-item cluster-trip {$selectedTripIds.has(
                            item.trip.id,
                        )
                            ? "selected"
                            : ""} {$highlightedTripIds.includes(item.trip.id)
                                ? "highlighted"
                                : ""}"
                        on:click={() => toggleSelect(item.trip.id)}
                    >
                        <input
                            type="checkbox"
                            checked={$selectedTripIds.has(item.trip.id)}
                            on:click|stopPropagation={() =>
                                toggleSelect(item.trip.id)}
                        />
                        <div class="trip-info">
                            <div class="trip-name">
                                {tripName(item.trip)}
                                {#if item.trip.hidden || item.groupHidden}
                                    <span title="Hidden from public">
                                        <EyeOff
                                            size="12"
                                            style="vertical-align: -2px; margin-left: 4px; color: #ff8c00;"
                                        />
                                    </span>
                                {/if}
                            </div>
                            <div class="trip-meta">
                                {formatDate(item.trip.started_at)}
                                {#if (item.trip.point_count ?? 0) > 0}
                                    · {item.trip.point_count} pts
                                {/if}
                            </div>
                        </div>
                        {#if $highlightedTripIds.includes(item.trip.id)}
                            <span
                                class="highlight-badge"
                                title="Highlighted on map">On map</span
                            >
                        {/if}
                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div class="trip-actions" on:click|stopPropagation>
                            <button
                                title="Show on map"
                                on:click={() =>
                                    dispatch("showTrip", item.trip.id)}
                            >
                                <MapPin size="14" />
                            </button>
                            {#if hasAuth}
                                <button
                                    title={item.trip.hidden
                                        ? "Show publicly"
                                        : "Hide from public"}
                                    on:click={() => toggleHidden(item.trip)}
                                >
                                    {#if item.trip.hidden}
                                        <EyeOff color="red" size="14" />
                                    {:else}
                                        <Eye size="14" />
                                    {/if}
                                </button>
                                <button
                                    title="Add to group"
                                    on:click={() =>
                                        openChooser({
                                            mode: "trip",
                                            tripId: item.trip.id,
                                        })}
                                >
                                    <FolderPlus size="14" />
                                </button>
                            {/if}
                            <button
                                title="Share"
                                on:click={() => shareTrip(item.trip)}
                            >
                                <Share2 size="14" />
                            </button>
                            <button
                                title="Edit"
                                on:click={() => editTrip(item.trip)}
                            >
                                <Pencil size="14" />
                            </button>
                            <button
                                title="Route guidance"
                                on:click={() =>
                                    dispatch("routeGuidance", item.trip.id)}
                            >
                                <Navigation size="14" />
                            </button>
                        </div>
                    </div>
                {/if}
            {/each}
            {#if $locations.length}
                <div class="cluster-header">
                    <span class="cluster-name">Locations</span>
                    <span class="cluster-count">{$locations.length}</span>
                </div>
                {#each $locations as location (location.id)}
                    {@const visited = visitedLocationIds.has(location.id)}
                    <div class="trip-item">
                        <div
                            class="trip-info {visited
                                ? "location-visited"
                                : ""}"
                        >
                            <div class="trip-name">{location.name}</div>
                        </div>
                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div class="trip-actions" on:click|stopPropagation>
                            // Button to associate a location with a trip/group 
                            <button on:click={() => null}>
                                <MenuIcon size="14" />
                            </button>
                            {#if visited}
                                <button
                                    title="Revert visited status"
                                    on:click={() => null}
                                >
                                    <X size="14" />
                                </button>
                            {:else}
                                <button
                                    title="Mark as visited"
                                    on:click={() => null}
                                >
                                    <Check size="14" />
                                </button>
                            {/if}
                        </div>
                    </div>
                {/each}
            {/if}
            {#if tripsError}
                <div class="sidebar-empty">
                    Failed to load trips — is the server running?
                    <button
                        class="btn btn-sm"
                        on:click={loadTrips}
                        style="margin-top:8px;">Retry</button
                    >
                </div>
            {:else if displayItems.length === 0}
                <div class="sidebar-empty">
                    {searchQuery
                        ? "No trips match your search."
                        : "No trips yet."}
                </div>
            {/if}
        </div>

        <div class="sidebar-footer">
            <button class="btn btn-sm" on:click={addNewTrip}>
                <Plus size="14" /> Add new trip
            </button>
            {#if hasAuth}
                <button
                    class="btn btn-sm btn-secondary"
                    on:click={addNewCluster}
                >
                    <FolderPlus size="14" /> Add group
                </button>
            {/if}
            <button class="btn btn-sm btn-secondary" on:click={exportAllTrips}>
                <Download size="14" /> Export trips
            </button>
            <button
                class="btn btn-sm btn-secondary"
                on:click={() => (showTrash = true)}
            >
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
                        <div class="trip-meta">
                            {formatDate(trip.deleted_at)} · trashed
                        </div>
                    </div>
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div class="trip-actions" on:click|stopPropagation>
                        <button
                            title="Restore"
                            on:click={() => restoreTrip(trip)}
                        >
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
