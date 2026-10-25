import type { GameSettings } from './settings';

/**
 * The prototype share code: base64 of `datasetHash|seed|baseSpeed|speedInc|phaseDist`.
 * Temporary: M4 replaces it with the versioned code. Kept byte-identical to what the
 * game over screen produced before, so codes already handed out still work.
 */
export function encodeLegacyShareCode(s: GameSettings): string {
    return btoa(`${s.datasetHash}|${s.seed}|${s.baseSpeed}|${s.speedInc}|${s.phaseDist}`);
}

export type DecodedShareCode = { ok: true; settings: GameSettings } | { ok: false; error: string };

export function decodeLegacyShareCode(code: string): DecodedShareCode {
    let raw: string;
    try { raw = atob(code.trim()); } catch { return { ok: false, error: 'Invalid share code.' }; }
    const parts = raw.split('|');
    if (parts.length !== 5) return { ok: false, error: 'Invalid share code.' };
    const [datasetHash, seed, baseSpeed, speedInc, phaseDist] = parts;
    const nums = [seed, baseSpeed, speedInc, phaseDist].map(Number);
    if (datasetHash === '' || nums.some(n => !Number.isFinite(n)) || !Number.isInteger(nums[0]) || nums[3] <= 0) {
        return { ok: false, error: 'Invalid share code.' };
    }
    return { ok: true, settings: { datasetHash, seed: nums[0], baseSpeed: nums[1], speedInc: nums[2], phaseDist: nums[3] } };
}
