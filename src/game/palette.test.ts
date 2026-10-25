import { describe, it, expect } from 'vitest';
import { buildColorMap, hslToRgb } from './palette';
import { CLIRENER_PALETTE } from '../data/sources/clirener-palette';
import type { EntityStats } from '../data/types';

const stats = (...labels: string[]): EntityStats[] => labels.map(label => ({ label, frequency: 1, avgLength: 1, hardnessScore: 1 }));

describe('hslToRgb', () => {
    it('matches known colors', () => {
        expect(hslToRgb(0, 1, 0.5)).toBe(0xff0000);
        expect(hslToRgb(1 / 3, 1, 0.5)).toBe(0x00ff00);
        expect(hslToRgb(2 / 3, 1, 0.5)).toBe(0x0000ff);
        expect(hslToRgb(0.5, 0, 0.5)).toBe(0x808080);
    });
});

describe('buildColorMap', () => {
    it('uses the source palette where it has a color, generated colors elsewhere', () => {
        const m = buildColorMap(stats('Person', 'Mystery'), CLIRENER_PALETTE);
        expect(m.get('Person')).toBe(CLIRENER_PALETTE['Person']);
        expect(m.get('Mystery')).toBeTypeOf('number');
        expect(m.get('Mystery')).not.toBe(m.get('Person'));
    });
    it('generates distinct, stable colors without a palette (dropped files)', () => {
        const a = buildColorMap(stats('A', 'B', 'C')), b = buildColorMap(stats('A', 'B', 'C'));
        expect([...a]).toEqual([...b]);
        expect(new Set(a.values()).size).toBe(3);
    });
    it('accepts black as a palette color', () => {
        expect(buildColorMap(stats('K'), { K: 0x000000 }).get('K')).toBe(0);
    });
});
