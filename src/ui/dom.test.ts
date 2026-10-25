import { describe, it, expect } from 'vitest';
import { overlayPlacement } from './dom';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/view';

const host = { left: 0, top: 0, width: 1700, height: 1000 };

describe('overlayPlacement', () => {
    it('at design size the overlay sits at its game coordinates', () => {
        const canvas = { left: 0, top: 0, width: GAME_WIDTH, height: GAME_HEIGHT };
        expect(overlayPlacement(canvas, { ...host, left: 0 }, { x: 145, y: 290, w: 560, h: 400 })).toEqual({ left: 145, top: 290, scale: 1 });
    });
    it('scales position and size with the canvas, and follows its centering offset', () => {
        // canvas shown at 2x (1700 x 1600), centered in a host that starts at (10, 20), scrolled 30px left of it
        const canvas = { left: 40, top: 20, width: GAME_WIDTH * 2, height: GAME_HEIGHT * 2 };
        expect(overlayPlacement(canvas, { left: 10, top: 20, width: 1800, height: 1600 }, { x: 100, y: 50, w: 10, h: 10 }))
            .toEqual({ left: 30 + 200, top: 0 + 100, scale: 2 });
    });
    it('letterboxed (height-limited) canvas: only the horizontal offset changes with the window width', () => {
        const small = { left: 250, top: 0, width: 425, height: 400 }; // half size, centered in a 925px host
        const p = overlayPlacement(small, { left: 0, top: 0, width: 925, height: 400 }, { x: 0, y: 0, w: GAME_WIDTH, h: GAME_HEIGHT });
        expect(p).toEqual({ left: 250, top: 0, scale: 0.5 });
    });
    it('falls back to scale 1 when the canvas has no size yet (hidden, or not laid out)', () => {
        expect(overlayPlacement({ left: 0, top: 0, width: 0, height: 0 }, host, { x: 5, y: 6, w: 1, h: 1 })).toEqual({ left: 5, top: 6, scale: 1 });
    });
});
