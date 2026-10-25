import { describe, it, expect } from 'vitest';
import { buildSettings, describeProgress, sizeLabel, shortHash } from './menuLogic';
import { encodeLegacyShareCode } from '../config/legacyShareCode';

const HASH = 'f'.repeat(16) + '0'.repeat(48);
const input = { baseSpeed: 0.7, speedInc: 0.2, phaseDist: 150, shareCode: '' };

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
    it('uses the sliders and a fresh seed without a share code', () => {
        expect(buildSettings(input, HASH, () => 7)).toEqual({ ok: true, settings: { datasetHash: shortHash(HASH), seed: 7, baseSpeed: 0.7, speedInc: 0.2, phaseDist: 150 } });
    });
    it('lets a share code for this dataset override sliders and seed', () => {
        const code = encodeLegacyShareCode({ datasetHash: shortHash(HASH), seed: 99, baseSpeed: 1, speedInc: 0.5, phaseDist: 60 });
        expect(buildSettings({ ...input, shareCode: ` ${code} ` }, HASH)).toEqual({ ok: true, settings: { datasetHash: shortHash(HASH), seed: 99, baseSpeed: 1, speedInc: 0.5, phaseDist: 60 } });
    });
    it('refuses a code made for another dataset, and a broken code', () => {
        const other = encodeLegacyShareCode({ datasetHash: '0123456789abcdef', seed: 1, baseSpeed: 1, speedInc: 0, phaseDist: 50 });
        expect(buildSettings({ ...input, shareCode: other }, HASH)).toMatchObject({ ok: false, error: expect.stringContaining('different dataset') });
        expect(buildSettings({ ...input, shareCode: 'nope!' }, HASH).ok).toBe(false);
    });
});
