import { sha256Hex } from '../core/hash';
import { seededRandom } from '../core/rng';
import { LAYOUT, TOWER, PHYSICS, COMBO, CAMERA, HEIGHT_UNIT_PX, REACH, PHASE } from '../config/ruleset';
import { canonicalize, CANONICAL_VERSION } from '../data/canonical';
import { SAMPLE_SENTENCES } from '../data/fixtures/sample';
import { makeSyntheticDataset } from '../data/fixtures/synthetic';
import { filterPlayable } from '../data/playable';
import { profileEntities } from '../data/profile';
import { TowerPlanner } from './tower';
import type { SentenceData } from '../data/types';
import { jumpVelocity, nextCameraY, scoreAtY, hasFallenOut } from './movement';
import { phaseAt, unstableLabelsAt } from './phases';

/**
 * Fingerprints that pin the rules (see docs/RULESET.md). They are compared against
 * `config/ruleset.lock.ts` by `ruleset.lock.test.ts`.
 *
 * The inputs below are FROZEN FIXTURES: `makeSyntheticDataset` and `SAMPLE_SENTENCES` are part of
 * the measuring instrument, so do not edit them (add new fixtures instead).
 */

/**
 * Hostile fixture: most sentences are tall (~11 lines) and can never meet the reach rule, either
 * because their only platform is on the top line (entry rise too big) or because they have platforms
 * on the first and last line (internal rise too big). A few short ones can. Forces the generator
 * through its full draw loop and its fallback, which ordinary data almost never does.
 */
function makeHostileDataset(): SentenceData[] {
    const out: SentenceData[] = [];
    for (let i = 0; i < 200; i++) {
        const long = i % 17 !== 0;                    // 12 of 200 are short
        const tokens = Array.from({ length: long ? 60 : 3 }, (_, k) => 'w'.repeat(long ? 8 : 2 + (k % 3)));
        const label = i % 2 === 0 ? 'A' : 'B';
        const ner: SentenceData['ner'] = long && i % 3 === 0 ? [[0, 0, label], [59, 59, label]] : [[0, 0, label]];
        out.push({ id: 'h' + i, text: tokens.join(' '), tokenized_text: tokens, ner });
    }
    return out;
}

/** Boundary cases for the layout: exact fit on a line, truncation limits, non-BMP characters. */
function makeEdgeDataset(): SentenceData[] {
    const t = (n: number) => 'e'.repeat(n);
    const rows: [string[], SentenceData['ner']][] = [
        [[t(16), t(16), t(16), 'next', 'line'], [[2, 2, 'A']]],            // third token ends exactly on the right edge
        [[t(16), t(16), t(17), 'next'], [[2, 2, 'B']]],                    // one character too wide: wraps
        [['go', t(49), 'x'], [[1, 1, 'A']]],                               // exactly the max token length
        [['go', t(50), 'x'], [[1, 1, 'B']]],                               // truncated
        [['go', t(120), 'x'], [[1, 1, 'A'], [2, 2, 'B']]],                 // far too long
        [['\u{1F600}\u{1F600}\u{1F600}', 'ok'], [[0, 1, 'A']]],               // surrogate pairs count as one character
        [['solo'], [[0, 0, 'B']]],
    ];
    return rows.map(([tokens, ner], i) => ({ id: 'e' + i, text: tokens.join(' '), tokenized_text: tokens, ner }));
}

/** JSON with sorted keys, so reordering fields in a constants object is not a rules change. */
function stable(value: unknown): string {
    return JSON.stringify(value, (_k, v) =>
        v !== null && typeof v === 'object' && !Array.isArray(v)
            ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
            : v);
}

/** Canonical text describing the gameplay rules: constants, pure rule functions, generated towers. */
export function rulesetFingerprintInput(): string {
    const out: string[] = [];

    out.push('constants', stable({ LAYOUT, TOWER, PHYSICS, COMBO, CAMERA, HEIGHT_UNIT_PX, REACH, PHASE }));

    // Pure rule functions, sampled
    const speeds = [0, 125, 250, 500, -500, 900];
    out.push('jump', stable(speeds.flatMap(v => [jumpVelocity(v, false), jumpVelocity(v, true)])));
    out.push('camera', stable([[1000, 0.5, 5000], [1000, 0.5, 400], [1000, 0, 5000], [-300, 1.5, -900]]
        .map(([c, s, p]) => nextCameraY(c, s, p))));
    out.push('score', stable([1900, 1805, 1000, 0, -12345].map(y => [scoreAtY(y), hasFallenOut(y, 1000, 800)])));
    out.push('phases', stable([[0, 100, 27], [99.9, 100, 27], [100, 100, 27], [1e6, 50, 27], [350, 0, 5]]
        .map(([h, d, n]) => phaseAt(h, d, n)).concat([3, 99].flatMap(p => unstableLabelsAt(p, ['a', 'b', 'c', 'd']).length))));

    // The generator end to end: filtering, label order, layout, phases, reachability, compression
    const datasets = [
        ['synthetic', filterPlayable(makeSyntheticDataset(800, 27, 7))],
        ['sample', filterPlayable(SAMPLE_SENTENCES)],
        ['hostile', makeHostileDataset()],
        ['edge', makeEdgeDataset()],
    ] as const;
    for (const [name, data] of datasets) {
        const order = profileEntities(data).map(s => s.label);
        out.push(`order:${name}`, order.join(','));
        for (const phaseDist of [50, 100]) {
            for (const seed of [1, 2]) {
                const planner = new TowerPlanner(data, seededRandom(seed), { labelOrder: order, phaseDist });
                out.push(`tower:${name}:${phaseDist}:${seed}`);
                for (let i = 0; i < (name === 'hostile' ? 300 : 100); i++) {
                    const p = planner.next();
                    out.push(`${p.index}|${p.topY}|${p.bottomY}|${p.gap}|${p.phase}|${p.fallback ? 'F' : '-'}|` +
                        p.layout.tokens.map(t => `${t.text}:${t.x},${t.y},${t.width}${t.label ? ':' + t.label : ''}`).join(';'));
                }
            }
        }
    }
    return out.join('\n');
}

/** SHA-256 over the gameplay rules. Pinned per RULESET_VERSION in config/ruleset.lock.ts. */
export function rulesetFingerprint(): string {
    return sha256Hex(rulesetFingerprintInput());
}

/**
 * SHA-256 over the dataset normalization rules (canonical order, ids, overlap resolution, hash).
 * Pinned per CANONICAL_VERSION: a change here re-orders datasets, so it needs its own bump.
 */
export function canonicalFingerprint(): string {
    const c = canonicalize([...makeSyntheticDataset(300, 12, 3), ...SAMPLE_SENTENCES]);
    return sha256Hex([
        `v${CANONICAL_VERSION}`, c.contentHash, stable(c.report),
        ...c.sentences.slice(0, 60).map(s => `${s.id}|${s.text}|${stable(s.ner)}`),
    ].join('\n'));
}
