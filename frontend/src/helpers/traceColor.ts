// Pure color helpers for GPS trace rendering (no Leaflet/Svelte imports,
// so the palette logic is unit-testable in isolation).

export const MAX_SPEED_KMH = 120;

// Flightradar24-style speed palette: green (slow) → yellow → orange →
// red → purple (fast). Speeds are clamped to [0, MAX_SPEED_KMH].
export const SPEED_STOPS: ReadonlyArray<{ speed: number; hue: number }> = [
    { speed: 0, hue: 120 }, // green
    { speed: 40, hue: 60 }, // yellow
    { speed: 70, hue: 30 }, // orange
    { speed: 100, hue: 0 }, // red
    { speed: 120, hue: 280 }, // purple
];

function clamp01(x: number): number {
    return Math.max(0, Math.min(1, x));
}

export function speedHue(kmh: number): number {
    const v = Math.max(0, Math.min(MAX_SPEED_KMH, kmh));

    let i = 0;
    while (i < SPEED_STOPS.length - 2 && v > SPEED_STOPS[i + 1].speed) i++;
    const a = SPEED_STOPS[i];
    const b = SPEED_STOPS[i + 1];
    const t = (v - a.speed) / (b.speed - a.speed);

    // Wrap-aware shortest signed hue delta, so 0° (red) → 280° (purple)
    // passes through magenta (~320°) instead of teal.
    const delta = ((((b.hue - a.hue) % 360) + 540) % 360) - 180;
    return Math.round(((a.hue + delta * t) % 360 + 360) % 360);
}

export function speedColor(kmh: number): string {
    return `hsl(${speedHue(kmh)}, 100%, 50%)`;
}

// Time-based gradient used for legacy trips without speed data.
// Same formula the app has always used for its trip traces.
export function timeHue(fraction: number): number {
    return Math.round(280 - clamp01(fraction) * 160);
}

export function timeColor(fraction: number): string {
    return `hsl(${timeHue(fraction)}, 100%, 50%)`;
}

// Fill missing (null) speeds by linear interpolation between the nearest
// known speeds, by point index (sampling is ~1 Hz and time-ordered).
// Returns null when no speed is known at all (legacy trip → time gradient).
export function fillSpeedGaps(speeds: ReadonlyArray<number | null>): number[] | null {
    const knownIndices: number[] = [];
    for (let i = 0; i < speeds.length; i++) {
        const s = speeds[i];
        if (s !== null && s !== undefined && Number.isFinite(s)) {
            knownIndices.push(i);
        }
    }

    if (knownIndices.length === 0) return null;

    const filled = new Array<number>(speeds.length);

    if (knownIndices.length === 1) {
        filled.fill(speeds[knownIndices[0]] as number);
        return filled;
    }

    let nextKnown = 0;
    for (let i = 0; i < speeds.length; i++) {
        const s = speeds[i];
        if (s !== null && s !== undefined && Number.isFinite(s)) {
            filled[i] = s as number;
            continue;
        }

        // Advance to the smallest known index >= i
        while (nextKnown < knownIndices.length && knownIndices[nextKnown] < i) {
            nextKnown++;
        }

        if (nextKnown === 0) {
            // Before the first known speed
            filled[i] = speeds[knownIndices[0]] as number;
        } else if (nextKnown >= knownIndices.length) {
            // After the last known speed
            filled[i] = speeds[knownIndices[knownIndices.length - 1]] as number;
        } else {
            const below = knownIndices[nextKnown - 1];
            const above = knownIndices[nextKnown];
            const t = (i - below) / (above - below);
            filled[i] = (speeds[below] as number) * (1 - t) + (speeds[above] as number) * t;
        }
    }
    return filled;
}
