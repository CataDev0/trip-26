import { writable } from "svelte/store";
import { LocationData, PathPoint } from "../helpers/mapData";

export const canSaveLocations = writable(false);
export const isSpliceMode = writable(false);
export const spliceStartPt = writable<PathPoint | null>(null);
export const spliceEndPt = writable<PathPoint | null>(null);
export const locations = writable<LocationData[]>([]);
export const markers = writable<L.Layer[]>([]);