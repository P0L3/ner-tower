import { describe, it, expect } from 'vitest';
import { heightAtY, phaseAt, unstableLabelsAt } from './phases';
import { PHYSICS, HEIGHT_UNIT_PX } from '../config/ruleset';

describe('phaseAt', () => {
    it('advances one phase per phaseDist meters and never goes negative', () => {
        expect(phaseAt(-5, 100, 10)).toBe(0);
        expect(phaseAt(99, 100, 10)).toBe(0);
        expect(phaseAt(100, 100, 10)).toBe(1);
        expect(phaseAt(350, 100, 10)).toBe(3);
    });

    it('caps at labelCount - 1 so the last label never turns unstable', () => {
        expect(phaseAt(1e9, 100, 10)).toBe(9);
        expect(phaseAt(1e9, 100, 1)).toBe(0);
        expect(phaseAt(1e9, 100, 0)).toBe(0);
    });

    it('survives a bad phaseDist', () => {
        expect(phaseAt(5, 0, 10)).toBe(5);
        expect(phaseAt(5, NaN, 10)).toBe(5);
    });
});

describe('unstableLabelsAt', () => {
    const order = ['A', 'B', 'C', 'D'];
    it('returns the first `phase` labels, so skipped phases still include every label', () => {
        expect(unstableLabelsAt(0, order)).toEqual([]);
        expect(unstableLabelsAt(1, order)).toEqual(['A']);
        expect(unstableLabelsAt(3, order)).toEqual(['A', 'B', 'C']);
    });
    it('never includes the last label', () => {
        expect(unstableLabelsAt(99, order)).toEqual(['A', 'B', 'C']);
        expect(unstableLabelsAt(5, ['ONLY'])).toEqual([]);
    });
});

describe('heightAtY', () => {
    it('matches the score formula and is 0 at the player start', () => {
        expect(heightAtY(PHYSICS.playerStartY)).toBe(0);
        expect(heightAtY(PHYSICS.playerStartY - 10 * HEIGHT_UNIT_PX)).toBe(10);
    });
});
