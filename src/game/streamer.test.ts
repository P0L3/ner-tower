import { describe, it, expect } from 'vitest';
import { TowerStreamer, STREAM, type StreamedView } from './streamer';
import { TowerPlanner, type PlacedSentence } from './tower';
import { seededRandom } from '../core/rng';
import { filterPlayable } from '../data/playable';
import { SAMPLE_SENTENCES } from '../data/fixtures/sample';

class FakeView implements StreamedView {
    redraws = 0;
    destroyed: boolean | 'shutdown' = false;
    readonly placed: PlacedSentence;
    constructor(placed: PlacedSentence) { this.placed = placed; }
    hasLabel(label: string) { return this.placed.layout.tokens.some(t => t.label === label); }
    redraw() { this.redraws++; }
    destroy(sceneShutdown?: boolean) { this.destroyed = sceneShutdown ? 'shutdown' : true; }
}

function setup(seed = 42) {
    const planner = new TowerPlanner(filterPlayable(SAMPLE_SENTENCES), seededRandom(seed));
    const created: FakeView[] = [];
    const streamer = new TowerStreamer(planner, p => { const v = new FakeView(p); created.push(v); return v; });
    return { planner, streamer, created };
}

describe('TowerStreamer', () => {
    it('fills the lookahead synchronously with an infinite budget', () => {
        const { planner, streamer } = setup();
        streamer.update(1200, 2000, Infinity);
        expect(planner.nextBottomY).toBeLessThanOrEqual(1200 - STREAM.lookahead);
        expect(streamer.liveCount).toBeGreaterThan(3);
    });

    it('builds at least one sentence per call even with a zero budget, but only one', () => {
        const { streamer, created } = setup();
        streamer.update(1200, 2000, 0);
        expect(created).toHaveLength(1);
        streamer.update(1200, 2000, 0);
        expect(created).toHaveLength(2);
    });

    it('does nothing when the tower is already built far enough ahead', () => {
        const { streamer, created } = setup();
        streamer.update(1200, 2000, Infinity);
        const n = created.length;
        streamer.update(1200, 2000, Infinity);
        expect(created).toHaveLength(n);
    });

    it('builds the same tower no matter how the work is spread over frames', () => {
        const a = setup(9), b = setup(9);
        a.streamer.update(-3000, -2200, Infinity);
        let top = 1200;
        while (b.planner.nextBottomY > -3000 - STREAM.lookahead) { b.streamer.update(top, top + 800, 0); top -= 1; }
        const idsA = a.created.map(v => v.placed.sentence.id);
        const idsB = b.created.map(v => v.placed.sentence.id);
        expect(idsB.slice(0, idsA.length)).toEqual(idsA);
    });

    it('culls sentences entirely below the camera, keeps the ones in or near view', () => {
        const { streamer, created } = setup();
        streamer.update(1200, 2000, Infinity);
        const total = created.length;
        // Camera climbs 2000px: everything built so far near the bottom should go
        streamer.update(-800, 0, Infinity);
        const culled = created.filter(v => v.destroyed === true);
        expect(culled.length).toBeGreaterThan(0);
        for (const v of culled) expect(v.placed.topY).toBeGreaterThan(0 + STREAM.cullMargin);
        for (const v of created.filter(v => v.destroyed === false)) {
            expect(v.placed.topY).toBeLessThanOrEqual(0 + STREAM.cullMargin);
        }
        expect(streamer.liveCount).toBe(created.length - culled.length);
        expect(created.length).toBeGreaterThanOrEqual(total);
    });

    it('keeps live objects bounded while climbing a long way', () => {
        const { streamer } = setup();
        let maxLive = 0;
        for (let top = 1200; top > -20000; top -= 15) {
            streamer.update(top, top + 800, STREAM.budgetMs);
            maxLive = Math.max(maxLive, streamer.liveCount);
        }
        expect(maxLive).toBeLessThan(40);
    });

    it('refreshLabel redraws only sentences that contain the label', () => {
        const { streamer, created } = setup();
        streamer.update(1200, 2000, Infinity);
        streamer.refreshLabel('DATE');
        for (const v of created) expect(v.redraws).toBe(v.hasLabel('DATE') ? 1 : 0);
        expect(created.some(v => v.redraws === 1)).toBe(true);
    });

    it('dispose releases every live view as a scene shutdown', () => {
        const { streamer, created } = setup();
        streamer.update(1200, 2000, Infinity);
        streamer.dispose();
        expect(streamer.liveCount).toBe(0);
        for (const v of created) expect(v.destroyed).toBe('shutdown');
    });
});
