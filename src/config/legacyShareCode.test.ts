import { describe, it, expect } from 'vitest';
import { encodeLegacyShareCode, decodeLegacyShareCode } from './legacyShareCode';

const s = { datasetHash: 'abcdef0123456789', seed: 424242, baseSpeed: 0.5, speedInc: 0.15, phaseDist: 100 };

describe('legacy share code', () => {
    it('keeps the prototype format byte for byte', () => {
        expect(encodeLegacyShareCode(s)).toBe(btoa('abcdef0123456789|424242|0.5|0.15|100'));
    });
    it('round-trips', () => {
        expect(decodeLegacyShareCode(encodeLegacyShareCode(s))).toEqual({ ok: true, settings: s });
    });
    it('rejects garbage instead of producing NaN settings', () => {
        for (const bad of ['%%%', btoa('a|b'), btoa('h|x|0.5|0.1|100'), btoa('h|1.5|0.5|0.1|100'), btoa('h|1|0.5|0.1|0'), btoa('|1|0.5|0.1|100')]) {
            expect(decodeLegacyShareCode(bad).ok).toBe(false);
        }
    });
});
