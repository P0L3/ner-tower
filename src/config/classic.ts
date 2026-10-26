import { sha256Hex } from '../core/hash';
import type { GameSettings } from './settings';

/**
 * Classic challenge: ONE fixed configuration per curated dataset (fixed seed, fixed difficulty),
 * so there is a global board that never rotates. It is an ordinary board (see board.ts), just
 * like the weekly challenge, except that nothing about it depends on the date.
 *
 * "Never changing" holds as long as three things hold, and each is guarded:
 *  - the rules: RULESET_VERSION and its lock test (a bump starts new boards on purpose);
 *  - the data: every source pins its expected content hash (`classicHash`); a mismatch pauses
 *    the Classic challenge instead of silently forking its board;
 *  - this file: `classic.test.ts` pins the seed, the preset and a board key.
 *
 * The seed derivation is part of what a Classic board means. Change the tag below (or the preset)
 * and every Classic board becomes a new one, so only do that on purpose.
 */
const SEED_TAG = 'ner-tower-classic-v1';

/** The fixed difficulty of every Classic board (same numbers as the sliders' starting values, but pinned here on its own). */
export const CLASSIC_PRESET = { baseSpeed: 0.5, speedInc: 0.15, phaseDist: 100 } as const;

/** 32-bit seed of a dataset's Classic board. */
export function classicSeed(datasetId: string): number {
    return parseInt(sha256Hex(`${SEED_TAG}|${datasetId}`).slice(0, 8), 16);
}

/** The Classic configuration of a dataset. `contentHash` is the short form (the source's pinned `classicHash`). */
export function classicSettings(datasetId: string, contentHash: string): GameSettings {
    return { datasetId, contentHash, seed: classicSeed(datasetId), ...CLASSIC_PRESET };
}

/** True if these settings are the Classic configuration of their dataset (whatever path led here, e.g. a share code). */
export function isClassicConfig(s: Pick<GameSettings, 'datasetId' | 'seed' | 'baseSpeed' | 'speedInc' | 'phaseDist'>): boolean {
    return s.seed === classicSeed(s.datasetId)
        && s.baseSpeed === CLASSIC_PRESET.baseSpeed && s.speedInc === CLASSIC_PRESET.speedInc && s.phaseDist === CLASSIC_PRESET.phaseDist;
}

/** Display name of the challenge a run belongs to, if any. */
export function challengeName(s: GameSettings): string | undefined {
    if (s.weekly) return `Weekly challenge ${s.weekly}`;
    return isClassicConfig(s) ? 'Classic challenge' : undefined;
}

