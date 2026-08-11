import { API_BASE } from "./Constants";
import { authFetch } from "./auth";
import { trashedTrips, trips, type Trip } from "../stores/tripStore";

// Load active trips and trashed trips from the server
export async function fetchTrips(): Promise<void> {
    const [activeRes, trashRes] = await Promise.all([
        fetch(API_BASE + "/api/trips"),
        fetch(API_BASE + "/api/trips?trashed=true"),
    ]);

    if (!activeRes.ok || !trashRes.ok) {
        throw new Error("Failed to load trips");
    }

    const [active, trash] = await Promise.all([
        activeRes.json(),
        trashRes.json(),
    ]);
    trips.update(() => active as Trip[]);
    trashedTrips.update(() => trash as Trip[]);
}

export async function createTrip(name: string): Promise<void> {
    await authFetch(API_BASE + "/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });
    await fetchTrips();
}

export async function renameTrip(id: number, name: string): Promise<void> {
    await authFetch(API_BASE + `/api/trips/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });
    await fetchTrips();
}

// Move trips to the trash bin (soft delete)
export async function trashTrips(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await authFetch(API_BASE + "/api/trips", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
    });
    await fetchTrips();
}

export async function restoreTrips(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await authFetch(API_BASE + "/api/trips/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
    });
    await fetchTrips();
}

// Permanently delete trips (removes their GPS points and locations too)
export async function purgeTrips(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await authFetch(API_BASE + "/api/trips/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
    });
    await fetchTrips();
}

function formatDate(value?: string | null): string {
    if (!value) return "Unknown date";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

// Download all trips (and their GPS points) as a JSON file
export async function exportTrips(): Promise<void> {
    const pathRes = await fetch(API_BASE + "/api/path");
    if (!pathRes.ok) throw new Error("Failed to load path data");
    const pathData: { trip_id?: number; lat: number; lng: number; timestamp?: string; current_speed?: number | null }[] =
        await pathRes.json();

    const activeTrips = await fetch(API_BASE + "/api/trips").then((res) => res.json());

    const pointsByTrip = new Map<number, typeof pathData>();
    pathData.forEach((point) => {
        if (point.trip_id === undefined || point.trip_id === null) return;
        if (!pointsByTrip.has(point.trip_id)) pointsByTrip.set(point.trip_id, []);
        pointsByTrip.get(point.trip_id)!.push(point);
    });

    const exportData = {
        exported_at: new Date().toISOString(),
        trips: activeTrips.map((trip: Trip) => ({
            ...trip,
            points: pointsByTrip.get(trip.id) ?? [],
        })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `trips-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
}

export { formatDate };
