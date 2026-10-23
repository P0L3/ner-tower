import { describe, it, expect } from 'vitest';
import { TowerPlanner, type PlacedSentence } from './tower';
import { seededRandom } from '../core/rng';
import { hashString } from '../core/hash';
import { TOWER, REACH, PHYSICS } from '../config/ruleset';
import { filterPlayable } from '../data/playable';
import { profileEntities } from '../data/profile';
import { unstableLabelsAt } from './phases';
import type { SentenceData } from '../data/types';
import { SAMPLE_SENTENCES } from '../data/fixtures/sample';
import { makeSyntheticDataset } from '../data/fixtures/synthetic';

function plan(dataset: SentenceData[], seed: number, n: number, phaseDist = 100): PlacedSentence[] {
    const labelOrder = profileEntities(dataset).map(s => s.label);
    const p = new TowerPlanner(dataset, seededRandom(seed), { labelOrder, phaseDist });
    return Array.from({ length: n }, () => p.next());
}

const sample = filterPlayable(SAMPLE_SENTENCES);

/** Everything that defines what a player sees and can stand on, as one string. */
function fingerprint(placed: PlacedSentence[]): string {
    return placed.map(p =>
        `${p.sentence.id}@${p.topY}-${p.bottomY}|g${p.gap}|ph${p.phase}|` +
        p.layout.tokens.map(t => `${t.text}:${t.x},${t.y},${t.width}${t.label ? ':' + t.label : ''}`).join(';')
    ).join('\n');
}

describe('TowerPlanner basics', () => {
    it('is deterministic: same seed and settings -> same tower', () => {
        expect(fingerprint(plan(sample, 42, 30))).toBe(fingerprint(plan(sample, 42, 30)));
    });

    it('different seeds give different towers', () => {
        expect(fingerprint(plan(sample, 1, 30))).not.toBe(fingerprint(plan(sample, 2, 30)));
    });

    it('phaseDist is part of the tower (it decides which labels count as stable)', () => {
        expect(fingerprint(plan(sample, 3, 60, 50))).not.toBe(fingerprint(plan(sample, 3, 60, 400)));
    });

    it('does not depend on how generation is batched (timing independence)', () => {
        const all = plan(sample, 7, 20, 50).map(p => p.sentence.id);
        const labelOrder = profileEntities(sample).map(s => s.label);
        const planner = new TowerPlanner(sample, seededRandom(7), { labelOrder, phaseDist: 50 });
        const batched: string[] = [];
        for (const size of [1, 3, 5, 11]) for (let i = 0; i < size; i++) batched.push(planner.next().sentence.id!);
        expect(batched).toEqual(all);
    });

    it('stacks sentences upward; gaps stay within [minGap, sentenceGap]', () => {
        const placed = plan(sample, 5, 25, 50);
        expect(placed[0].bottomY).toBeLessThanOrEqual(TOWER.firstBottomY);
        for (let i = 1; i < placed.length; i++) {
            expect(placed[i].gap).toBeGreaterThanOrEqual(REACH.minGap);
            expect(placed[i].gap).toBeLessThanOrEqual(TOWER.sentenceGap);
            expect(placed[i].bottomY).toBe(placed[i - 1].topY - placed[i].gap);
            expect(placed[i].topY).toBeLessThan(placed[i].bottomY);
        }
    });

    it('exposes the next free bottom edge at the default gap', () => {
        const labelOrder = profileEntities(sample).map(s => s.label);
        const p = new TowerPlanner(sample, seededRandom(5), { labelOrder, phaseDist: 100 });
        const first = p.next();
        expect(p.nextBottomY).toBe(first.topY - TOWER.sentenceGap);
    });

    it('rejects a dataset without any valid entity', () => {
        const opts = { labelOrder: [], phaseDist: 100 };
        expect(() => new TowerPlanner([], seededRandom(1), opts)).toThrow();
        expect(() => new TowerPlanner(SAMPLE_SENTENCES.filter(s => s.id === 'fx-4' || s.id === 'fx-11'), seededRandom(1), opts)).toThrow();
    });
});

describe('TowerPlanner: reachability guarantee (property test)', () => {
    const synthetic = filterPlayable(makeSyntheticDataset(1500, 27, 7));
    const order = profileEntities(synthetic).map(s => s.label);
    const last = order[order.length - 1];

    for (const phaseDist of [50, 100]) {
        for (const seed of [1, 2, 3]) {
            it(`phaseDist ${phaseDist}, seed ${seed}: every sentence has a stable platform and every climb is within reach`, () => {
                const placed = plan(synthetic, seed, 400, phaseDist);
                let lastTop = PHYSICS.groundY - PHYSICS.groundHeight / 2;
                let fallbacks = 0, maxPhase = 0;

                for (const p of placed) {
                    maxPhase = Math.max(maxPhase, p.phase);
                    // Recompute independently of the planner's own bookkeeping
                    const unstable = new Set(unstableLabelsAt(p.phase, order));
                    const tops = p.layout.tokens
                        .filter(t => t.label !== undefined && !unstable.has(t.label))
                        .map(t => p.topY + t.platform!.y)
                        .sort((a, b) => b - a); // bottom -> top
                    expect(tops.length).toBeGreaterThan(0);

                    if (p.fallback) fallbacks++;
                    else for (const top of tops) {
                        const rise = lastTop - top;
                        if (rise > 0) { expect(rise).toBeLessThanOrEqual(REACH.maxRise); lastTop = top; }
                    }
                    if (p.fallback) lastTop = Math.min(lastTop, tops[tops.length - 1]);
                }

                expect(maxPhase).toBe(order.length - 1);          // the run really covered every phase
                expect(fallbacks / placed.length).toBeLessThan(0.02);
            });
        }
    }

    it('at the deepest phase every sentence contains the one label that never turns unstable', () => {
        const placed = plan(synthetic, 11, 300, 50).filter(p => p.phase === order.length - 1 && !p.fallback);
        expect(placed.length).toBeGreaterThan(50);
        for (const p of placed) expect(p.layout.tokens.some(t => t.label === last)).toBe(true);
    });

    it('phaseOverride pins every placement to one phase', () => {
        const labelOrder = order;
        const p = new TowerPlanner(synthetic, seededRandom(5), { labelOrder, phaseDist: 100, phaseOverride: 10 });
        const placed = Array.from({ length: 50 }, () => p.next());
        for (const s of placed) expect(s.phase).toBe(10);
        const unstable = new Set(unstableLabelsAt(10, order));
        for (const s of placed.filter(x => !x.fallback)) expect(s.layout.tokens.some(t => t.label && !unstable.has(t.label))).toBe(true);
    });

    it('phases never go down along the tower', () => {
        const phases = plan(synthetic, 4, 300, 50).map(p => p.phase);
        for (let i = 1; i < phases.length; i++) expect(phases[i]).toBeGreaterThanOrEqual(phases[i - 1]);
    });
});

describe('GOLDEN: tower for seed 42 on the sample dataset (phaseDist 50)', () => {
    // If this fails you changed what existing seeds produce.
    //  - Before the ruleset freeze (RULESET_VERSION = 0): inspect the change, then update the constants.
    //  - After the freeze: bump RULESET_VERSION instead, and only then update the constants.
    it('matches the recorded sequence and geometry', () => {
        const placed = plan(sample, 42, 12, 50);
        expect(placed.map(p => p.sentence.id).join(',')).toBe('fx-7,fx-6,fx-9,fx-8,fx-2,fx-6,fx-3,fx-8,fx-10,fx-6,fx-5,fx-9');
        expect(placed.map(p => `${p.phase}/${p.gap}`).join(',')).toBe('0/120,1/120,1/120,1/120,2/120,2/120,2/120,3/120,3/120,4/120,4/120,4/120');
        expect(hashString(fingerprint(placed))).toBe('1f39124d');
    });
});
