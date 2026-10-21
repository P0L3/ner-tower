import { describe, it, expect } from 'vitest';
import { TowerPlanner, type PlacedSentence } from './tower';
import { seededRandom } from '../core/rng';
import { hashString } from '../core/hash';
import { TOWER } from '../config/ruleset';
import { filterPlayable } from '../data/playable';
import { SAMPLE_SENTENCES } from '../data/fixtures/sample';

const playable = filterPlayable(SAMPLE_SENTENCES);

function plan(seed: number, n: number): PlacedSentence[] {
    const p = new TowerPlanner(playable, seededRandom(seed));
    return Array.from({ length: n }, () => p.next());
}

/** Everything that defines what a player sees and can stand on, as one string. */
function fingerprint(placed: PlacedSentence[]): string {
    return placed.map(p =>
        `${p.sentence.id}@${p.topY}-${p.bottomY}|` +
        p.layout.tokens.map(t => `${t.text}:${t.x},${t.y},${t.width}${t.label ? ':' + t.label : ''}`).join(';')
    ).join('\n');
}

describe('TowerPlanner', () => {
    it('is deterministic: same seed -> same tower', () => {
        expect(fingerprint(plan(42, 30))).toBe(fingerprint(plan(42, 30)));
    });

    it('different seeds give different towers', () => {
        expect(fingerprint(plan(1, 30))).not.toBe(fingerprint(plan(2, 30)));
    });

    it('does not depend on how generation is batched (timing independence)', () => {
        const all = plan(7, 20).map(p => p.sentence.id);
        const planner = new TowerPlanner(playable, seededRandom(7));
        const batched: string[] = [];
        for (const size of [1, 3, 5, 11]) for (let i = 0; i < size; i++) batched.push(planner.next().sentence.id!);
        expect(batched).toEqual(all);
    });

    it('stacks sentences upward with a fixed gap, starting at the ruleset origin', () => {
        const placed = plan(5, 10);
        expect(placed[0].bottomY).toBe(TOWER.firstBottomY);
        for (let i = 1; i < placed.length; i++) {
            expect(placed[i].bottomY).toBe(placed[i - 1].topY - TOWER.sentenceGap);
            expect(placed[i].topY).toBeLessThan(placed[i].bottomY);
        }
    });

    it('exposes the next free bottom edge', () => {
        const p = new TowerPlanner(playable, seededRandom(5));
        const first = p.next();
        expect(p.nextBottomY).toBe(first.topY - TOWER.sentenceGap);
    });

    it('rejects an empty dataset', () => {
        expect(() => new TowerPlanner([], seededRandom(1))).toThrow();
    });
});

describe('GOLDEN: tower for seed 42 on the sample dataset', () => {
    // If this fails you changed what existing seeds produce.
    //  - Before the ruleset freeze (RULESET_VERSION = 0): inspect the change, then update the constants.
    //  - After the freeze: bump RULESET_VERSION instead, and only then update the constants.
    it('matches the recorded sequence and geometry', () => {
        const placed = plan(42, 12);
        expect(placed.map(p => p.sentence.id).join(',')).toBe('fx-7,fx-6,fx-9,fx-8,fx-2,fx-6,fx-3,fx-7,fx-9,fx-6,fx-3,fx-9');
        expect(hashString(fingerprint(placed))).toBe('2162c849');
    });
});
