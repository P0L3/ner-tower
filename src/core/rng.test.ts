import { describe, it, expect } from 'vitest';
import { seededRandom } from './rng';

describe('seededRandom', () => {
    it('produces the same sequence for the same seed', () => {
        const a = seededRandom(12345), b = seededRandom(12345);
        const seqA = Array.from({ length: 50 }, () => a());
        const seqB = Array.from({ length: 50 }, () => b());
        expect(seqA).toEqual(seqB);
    });

    it('produces different sequences for different seeds', () => {
        const a = seededRandom(1), b = seededRandom(2);
        expect(a()).not.toEqual(b());
    });

    it('stays within [0, 1)', () => {
        const r = seededRandom(999);
        for (let i = 0; i < 1000; i++) {
            const v = r();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });
});
