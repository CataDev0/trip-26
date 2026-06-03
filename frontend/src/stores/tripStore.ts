import { writable } from "svelte/store";
import { PathPoint } from "../helpers/mapData";

export const gpsPath = writable<PathPoint[]>([]);