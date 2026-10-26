import { describe, it, expect } from 'vitest';
import { buildSettings, describeProgress, sizeLabel } from './menuLogic';
import { encodeShareCode } from '../config/shareCode';
import { LOCAL_DATASET_ID } from '../config/settings';
import { weeklySettings } from '../config/weekly';
import { classicSettings } from '../config/classic';

const HASH = 'f'.repeat(16) + '0'.repeat(48);
const SILVER = { datasetId: 'P0L3/CliReNER_v_1_1_28_SILVER', contentHash: HASH };
const custom = { kind: 'custom' as const, baseSpeed: 0.7, speedInc: 0.2, phaseDist: 150, shareCode: '' };
const made = { datasetId: SILVER.datasetId, contentHash: 'f'.repeat(16), seed: 99, baseSpeed: 1, speedInc: 0.5, phaseDist: 60 };

describe('describeProgress', () => {
    it('is indeterminate until the total is known, then a fraction', () => {
        expect(describeProgress(undefined).fraction).toBeUndefined();
        expect(describeProgress({ phase: 'discover' }).fraction).toBeUndefined();
        expect(describeProgress({ phase: 'download', loaded: 0, total: 0 }).fraction).toBeUndefined();
        expect(describeProgress({ phase: 'download', loaded: 96, total: 192 })).toEqual({ label: 'Downloading sentences 96 / 192', fraction: 0.5 });
        expect(describeProgress({ phase: 'done' }).fraction).toBe(1);
    });
});

describe('sizeLabel', () => {
    it('formats with thousands separators', () => {
        expect(sizeLabel({ expectedRows: 1027 })).toBe('1,027 sentences');
        expect(sizeLabel({ expectedRows: 192 })).toBe('192 sentences');
        expect(sizeLabel({ expectedRows: undefined })).toBe('size unknown');
    });
});

describe('buildSettings', () => {
    it('uses the sliders (snapped to the grid) and a fresh seed without a share code', () => {
        expect(buildSettings({ ...custom, baseSpeed: 0.7000000001 }, SILVER, () => 0.000007)).toEqual({
            ok: true, settings: { datasetId: SILVER.datasetId, contentHash: 'f'.repeat(16), seed: 7, baseSpeed: 0.7, speedInc: 0.2, phaseDist: 150 },
        });
    });
    it('lets a share code for this exact data override sliders and seed', () => {
        expect(buildSettings({ ...custom, shareCode: ` ${encodeShareCode(made)} ` }, SILVER)).toEqual({ ok: true, settings: made });
    });
    it('refuses a code made for another dataset, naming both', () => {
        const other = encodeShareCode({ ...made, datasetId: 'P0L3/CliReNER_v_1_1_28_GOLD' });
        expect(buildSettings({ ...custom, shareCode: other }, SILVER)).toMatchObject({ ok: false, error: expect.stringContaining('GOLD, not P0L3/CliReNER_v_1_1_28_SILVER') });
        const local = encodeShareCode({ ...made, datasetId: LOCAL_DATASET_ID });
        expect(buildSettings({ ...custom, shareCode: local }, SILVER)).toMatchObject({ ok: false, error: expect.stringContaining('a dropped file') });
    });
    it('refuses a code for the same dataset whose data has changed', () => {
        const stale = encodeShareCode({ ...made, contentHash: '0123456789abcdef' });
        expect(buildSettings({ ...custom, shareCode: stale }, SILVER)).toMatchObject({ ok: false, error: expect.stringContaining('different data') });
    });
    it('passes share code problems through, and replays dropped files by content', () => {
        expect(buildSettings({ ...custom, shareCode: 'nope!' }, SILVER).ok).toBe(false);
        const local = { ...made, datasetId: LOCAL_DATASET_ID };
        expect(buildSettings({ ...custom, shareCode: encodeShareCode(local) }, { datasetId: LOCAL_DATASET_ID, contentHash: HASH })).toEqual({ ok: true, settings: local });
    });
    it('weekly ignores sliders and codes, and is not offered for dropped files', () => {
        const now = new Date('2026-10-25T10:00:00Z');
        expect(buildSettings({ kind: 'weekly', now }, SILVER)).toEqual({ ok: true, settings: weeklySettings(now, SILVER.datasetId, 'f'.repeat(16)) });
        expect(buildSettings({ kind: 'weekly', now }, { datasetId: LOCAL_DATASET_ID, contentHash: HASH }).ok).toBe(false);
    });
});

describe('buildSettings: classic', () => {
    const pinned = 'f'.repeat(16);
    it('is the fixed configuration of the dataset, whatever the sliders say', () => {
        expect(buildSettings({ kind: 'classic', pinnedHash: pinned }, SILVER)).toEqual({ ok: true, settings: classicSettings(SILVER.datasetId, pinned) });
    });
    it('is paused when the data no longer matches the pinned hash, and absent without one', () => {
        expect(buildSettings({ kind: 'classic', pinnedHash: '0123456789abcdef' }, SILVER)).toMatchObject({ ok: false, error: expect.stringContaining('paused') });
        expect(buildSettings({ kind: 'classic', pinnedHash: undefined }, SILVER)).toMatchObject({ ok: false, error: expect.stringContaining('no Classic') });
        expect(buildSettings({ kind: 'classic', pinnedHash: pinned }, { datasetId: LOCAL_DATASET_ID, contentHash: HASH }).ok).toBe(false);
    });
});
