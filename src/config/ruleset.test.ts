import { describe, it, expect } from 'vitest';
import { jumpApex, REACH, PHYSICS } from './ruleset';

describe('jumpApex', () => {
    it('matches the measured Arcade-integration apex heights', () => {
        expect(jumpApex(650)).toBeCloseTo(170.7, 0);
        expect(jumpApex(850)).toBeCloseTo(294.0, 0);
        expect(jumpApex(950)).toBeCloseTo(368.2, 0);
    });
    it('is monotonic in jump speed and safe on bad input', () => {
        expect(jumpApex(900)).toBeGreaterThan(jumpApex(800));
        expect(jumpApex(0)).toBe(0);
        expect(jumpApex(500, 0)).toBe(0);
    });
});

describe('REACH', () => {
    it('is derived from the physics constants and stays below the running apex', () => {
        expect(REACH.runningApex).toBeCloseTo(294, 0);
        expect(REACH.maxRise).toBe(Math.floor(REACH.runningApex * REACH.margin));
        expect(REACH.maxRise).toBeLessThan(REACH.runningApex);
        expect(REACH.maxRise).toBeGreaterThan(jumpApex(-PHYSICS.jumpVelocity)); // needs a running jump at the limit
    });
});
