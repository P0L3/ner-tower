/**
 * What defines a run, and so a leaderboard board. See docs/BOARDS.md.
 *
 * Together with RULESET_VERSION, these fields are the whole identity of a board: the same
 * configuration always builds the same tower, and scores are compared per configuration.
 */
export interface GameSettings {
    /**
     * Which data. A Hugging Face repo name ('P0L3/CliReNER_v_1_1_28_SILVER') for curated datasets,
     * LOCAL_DATASET_ID for a file the player dropped in.
     */
    datasetId: string;
    /** First CONTENT_HASH_CHARS hex chars of the canonical dataset's content hash. */
    contentHash: string;
    seed: number;
    baseSpeed: number;
    speedInc: number;
    phaseDist: number;
    /** Display only ('2026-W43' for a weekly challenge run). NOT part of the configuration or board key. */
    weekly?: string;
}

/**
 * The values the difficulty sliders can take. A share code is only accepted if its values lie
 * on this grid, so a board cannot be forked by hand-editing a code to 0.1337 speed.
 * Widening a range is harmless; narrowing it or moving the grid makes old codes unreadable.
 */
export const SETTING_RANGES = {
    baseSpeed: { min: 0.1, max: 2.0, step: 0.1, initial: 0.5 },
    speedInc: { min: 0, max: 1.0, step: 0.05, initial: 0.15 },
    phaseDist: { min: 50, max: 500, step: 10, initial: 100 },
} as const;

export type SettingKey = keyof typeof SETTING_RANGES;

/** Nearest grid value inside the range, as a clean decimal (0.3, not 0.30000000000000004). */
export function snapSetting(key: SettingKey, value: number): number {
    const r = SETTING_RANGES[key];
    if (!Number.isFinite(value)) return r.initial;
    const maxN = Math.round((r.max - r.min) / r.step);
    const n = Math.min(Math.max(Math.round((value - r.min) / r.step), 0), maxN);
    return Number((r.min + n * r.step).toFixed(2));
}

export function isOnGrid(key: SettingKey, value: number): boolean {
    return Number.isFinite(value) && Math.abs(snapSetting(key, value) - value) < 1e-9;
}

/** Characters of the content hash that go into share codes and board keys (64 bits). */
export const CONTENT_HASH_CHARS = 16;
export const shortContentHash = (fullHash: string): string => fullHash.slice(0, CONTENT_HASH_CHARS);

/** Dataset id of a file the player dropped in. The colon cannot occur in a Hugging Face repo name. */
export const LOCAL_DATASET_ID = 'local:file';

/** `local:file`, or a repo name with an optional org (`org/name`, `conll2003`). */
export function isValidDatasetId(id: string): boolean {
    return id.length <= 100 && /^(?:local:file|[A-Za-z0-9][\w.-]*(?:\/[\w.-]+)?)$/.test(id);
}

export const SEED_MAX = 4294967295;

/** Seed for a fresh run: six digits, easy to read out loud. */
export function randomSeed(random: () => number = Math.random): number {
    return Math.floor(random() * 1_000_000);
}

/** Same run settings with another seed. The weekly label is dropped: a new seed is no longer the weekly board. */
export function withNewSeed(s: GameSettings, seed: number): GameSettings {
    return { datasetId: s.datasetId, contentHash: s.contentHash, seed, baseSpeed: s.baseSpeed, speedInc: s.speedInc, phaseDist: s.phaseDist };
}

/** Returns a message if the settings cannot be a board configuration, else undefined. */
export function settingsProblem(s: GameSettings): string | undefined {
    if (!isValidDatasetId(s.datasetId)) return 'invalid dataset id';
    if (!/^[0-9a-f]{16}$/.test(s.contentHash)) return 'invalid content hash';
    if (!Number.isInteger(s.seed) || s.seed < 0 || s.seed > SEED_MAX) return 'seed out of range';
    for (const key of ['baseSpeed', 'speedInc', 'phaseDist'] as const) {
        if (!isOnGrid(key, s[key])) return `${key} is not an allowed value`;
    }
    return undefined;
}
