import { describe, it, expect } from 'vitest';
import { jumpVelocity, nextCameraY, scoreAtY, hasFallenOut } from './movement';
import { PHYSICS, CAMERA } from '../config/ruleset';

describe('jumpVelocity', () => {
    it('is the base jump when standing still and gets stronger with speed in either direction', () => {
        expect(jumpVelocity(0, false)).toBe(-650);
        expect(jumpVelocity(500, false)).toBe(-850);
        expect(jumpVelocity(-500, false)).toBe(-850);
        expect(jumpVelocity(250, false)).toBe(-750);
    });
    it('adds the super jump bonus', () => {
        expect(jumpVelocity(0, true)).toBe(-650 - PHYSICS.superJumpBonus);
    });
});

describe('nextCameraY', () => {
    it('scrolls up by the scroll speed when the player is not pulling it', () => {
        expect(nextCameraY(1000, 0.5, 5000)).toBe(999.5);
    });
    it('follows the player upward at a fixed offset', () => {
        expect(nextCameraY(1000, 0.5, 400)).toBe(400 - CAMERA.followOffsetY);
    });
    it('never scrolls down', () => {
        expect(nextCameraY(1000, 0, 5000)).toBe(1000);
    });
});

describe('scoreAtY / hasFallenOut', () => {
    it('scores whole meters above the start', () => {
        expect(scoreAtY(PHYSICS.playerStartY)).toBe(0);
        expect(scoreAtY(PHYSICS.playerStartY - 95)).toBe(9);
        expect(scoreAtY(PHYSICS.playerStartY - 100)).toBe(10);
    });
    it('ends the run only once the player is below the view', () => {
        expect(hasFallenOut(1799, 1000, 800)).toBe(false);
        expect(hasFallenOut(1800, 1000, 800)).toBe(false);
        expect(hasFallenOut(1801, 1000, 800)).toBe(true);
    });
});
