import { API_BASE } from "./Constants";
import { authFetch } from "./auth";
import { clusters, type Cluster } from "../stores/tripStore";
import { fetchTrips } from "./trips";

// Load trip groups (clusters) from the server.
// authFetch attaches credentials when available so logged-in users also
// receive groups that are hidden from the public
export async function fetchClusters(): Promise<void> {
    const res = await authFetch(API_BASE + "/api/clusters");
    if (!res.ok) {
        throw new Error("Failed to load clusters");
    }
    const data = await res.json();
    clusters.update(() => data as Cluster[]);
}

export async function createCluster(name: string): Promise<number> {
    const res = await authFetch(API_BASE + "/api/clusters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });
    const data = await res.json();
    await fetchClusters();
    return data.id as number;
}

export async function renameCluster(id: number, name: string): Promise<void> {
    await authFetch(API_BASE + `/api/clusters/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });
    await fetchClusters();
}

// Delete a group — its trips are ungrouped (kept) on the server
export async function deleteCluster(id: number): Promise<void> {
    await authFetch(API_BASE + `/api/clusters/${id}`, {
        method: "DELETE",
    });
    await Promise.all([fetchClusters(), fetchTrips()]);
}

// Hide a group from public viewing (or show it again)
export async function setClusterHidden(id: number, hidden: boolean): Promise<void> {
    await authFetch(API_BASE + `/api/clusters/${id}/hidden`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden }),
    });
    await Promise.all([fetchClusters(), fetchTrips()]);
}

// Assign trips to a group, or ungroup them (clusterId = null)
export async function assignTripsToCluster(
    tripIds: number[],
    clusterId: number | null,
): Promise<void> {
    if (tripIds.length === 0) return;
    await authFetch(API_BASE + "/api/clusters/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripIds, clusterId }),
    });
    await fetchTrips();
}
