export interface AttractionData {
    id: number;
    name: string;
    lat: number;
    lon: number;
    tags: Record<string, string>;
}

export type SaveAttractionFunction = (
    map: L.Map,
    name: string,
    lat: number,
    lng: number) => Promise<void>;

export type LeafletWindow = Window & typeof globalThis & {
    markVisited?: (locationId: number) => Promise<void>;
    saveAttraction?: SaveAttractionFunction;
    getAuthHeader?: () => Promise<{ Authorization?: string }>;
};