/**
 * Player-chosen loudness of the music and of the sound effects. Cosmetic and per browser:
 * never part of a run's configuration, a board or the ruleset.
 */
export interface Volumes { music: number; effects: number }

/** Effects start well below the music: jumps and landings fire all the time. */
export const DEFAULT_VOLUMES: Readonly<Volumes> = { music: 0.8, effects: 0.5 };

/** The ZzFX presets were written loud; at full slider the effects play at this fraction of their preset volume. */
export const EFFECT_BASE = 0.5;

const KEY = 'ner-tower:volume';

type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;
const local = (): Storage | undefined => { try { return localStorage; } catch { return undefined; } };

export const clampVolume = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

export function loadVolumes(storage: Reader | undefined = local()): Volumes {
    try {
        const raw = JSON.parse(storage?.getItem(KEY) ?? '{}') as Partial<Record<keyof Volumes, unknown>> | null;
        return { music: clampVolume(raw?.music, DEFAULT_VOLUMES.music), effects: clampVolume(raw?.effects, DEFAULT_VOLUMES.effects) };
    } catch { return { ...DEFAULT_VOLUMES }; }
}

export function saveVolumes(v: Volumes, storage: Writer | undefined = local()): void {
    try { storage?.setItem(KEY, JSON.stringify(v)); } catch { /* keep it for this session only */ }
}

/** Multiplier for a ZzFX preset's own volume (its first parameter). */
export const effectGain = (effects: number): number => clampVolume(effects, DEFAULT_VOLUMES.effects) * EFFECT_BASE;

export type SoundPreset = readonly (number | undefined)[];

/** The preset with its volume scaled. Holes in the preset (use the default) are kept. */
export function scaleSound(preset: SoundPreset, gain: number): (number | undefined)[] {
    const out = [...preset];
    out[0] = (preset[0] ?? 1) * gain;
    return out;
}

let current: Volumes | undefined;

/** Current volumes (loaded from storage on first use). */
export function getVolumes(): Volumes { return current ??= loadVolumes(); }

export function setVolumes(change: Partial<Volumes>): Volumes {
    const base = getVolumes();
    current = { music: clampVolume(change.music, base.music), effects: clampVolume(change.effects, base.effects) };
    saveVolumes(current);
    return current;
}
