import { describe, it, expect } from 'vitest';
import { SETTING_RANGES, isOnGrid, snapSetting, isValidDatasetId, randomSeed, withNewSeed, settingsProblem, shortContentHash, LOCAL_DATASET_ID, type GameSettings } from './settings';

const s: GameSettings = { datasetId: 'org/name', contentHash: '0123456789abcdef', seed: 5, baseSpeed: 0.5, speedInc: 0.15, phaseDist: 100, weekly: '2026-W43' };

describe('setting grid', () => {
    it('snaps to clean decimals inside the range', () => {
        expect(snapSetting('baseSpeed', 0.30000000000000004)).toBe(0.3);
        expect(snapSetting('baseSpeed', 99)).toBe(2);
        expect(snapSetting('baseSpeed', -1)).toBe(0.1);
        expect(snapSetting('speedInc', 0.16)).toBe(0.15);
        expect(snapSetting('phaseDist', 123)).toBe(120);
        expect(snapSetting('phaseDist', NaN)).toBe(100);
    });
    it('every slider position is on the grid, and n/100 equals what the slider string parses to', () => {
        for (const key of ['baseSpeed', 'speedInc', 'phaseDist'] as const) {
            const r = SETTING_RANGES[key];
            for (let v = r.min, i = 0; v <= r.max + 1e-9; i++, v = r.min + i * r.step) {
                const clean = snapSetting(key, v);
                expect(isOnGrid(key, clean)).toBe(true);
                expect(Math.round(clean * 100) / 100).toBe(parseFloat(clean.toFixed(2)));
            }
        }
    });
    it('rejects off-grid and out-of-range values', () => {
        expect(isOnGrid('baseSpeed', 0.15)).toBe(false);
        expect(isOnGrid('baseSpeed', 2.1)).toBe(false);
        expect(isOnGrid('phaseDist', 45)).toBe(false);
        expect(isOnGrid('speedInc', Infinity)).toBe(false);
    });
});

describe('dataset ids', () => {
    it('accepts repo names with or without an org, and the local id; rejects anything else', () => {
        for (const ok of ['P0L3/CliReNER_v_1_1_28_SILVER', 'conll2003', 'a.b-c/d_e.f', LOCAL_DATASET_ID]) expect(isValidDatasetId(ok), ok).toBe(true);
        for (const bad of ['', '/x', 'a/b/c', 'a b', 'a|b', 'hf:org/name', 'local:other', 'x'.repeat(101), 'org/']) expect(isValidDatasetId(bad), bad).toBe(false);
    });
});

describe('helpers', () => {
    it('randomSeed is a six digit integer', () => {
        expect(randomSeed(() => 0)).toBe(0);
        expect(randomSeed(() => 0.9999999)).toBe(999999);
    });
    it('withNewSeed keeps the configuration but drops the weekly label', () => {
        expect(withNewSeed(s, 9)).toEqual({ datasetId: 'org/name', contentHash: '0123456789abcdef', seed: 9, baseSpeed: 0.5, speedInc: 0.15, phaseDist: 100 });
    });
    it('settingsProblem names what is wrong', () => {
        expect(settingsProblem(s)).toBeUndefined();
        expect(settingsProblem({ ...s, seed: -1 })).toMatch(/seed/);
        expect(settingsProblem({ ...s, seed: 1.5 })).toMatch(/seed/);
        expect(settingsProblem({ ...s, contentHash: 'XYZ' })).toMatch(/hash/);
        expect(settingsProblem({ ...s, phaseDist: 33 })).toMatch(/phaseDist/);
    });
    it('shortContentHash takes 16 chars', () => { expect(shortContentHash('a'.repeat(64))).toBe('a'.repeat(16)); });
});
