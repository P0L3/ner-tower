/**
 * Dataset health report for NER Tower.
 *
 *   npm run analyze -- path/to/data.json [--seed 1] [--sentences 500]
 *   npm run analyze -- --synthetic
 *
 * Builds towers with the real generator, pinned to each phase in turn, and reports how
 * climbable they are (`--sentences` placements per phase).
 * Accepts the same formats as the in-game drag & drop (JSON array, JSONL or CoNLL) and runs the same
 * canonicalization, so it analyzes exactly the dataset the game would play.
 */
import { readFileSync } from 'node:fs';
import { seededRandom } from '../src/core/rng';
import { loadDatasetText } from '../src/data/load';
import { DatasetParseError } from '../src/data/formats/index';
import { filterPlayable, isValidSpan } from '../src/data/playable';
import { profileEntities } from '../src/data/profile';
import { makeSyntheticDataset } from '../src/data/fixtures/synthetic';
import { TowerPlanner, type PlacedSentence } from '../src/game/tower';
import { REACH, TOWER } from '../src/config/ruleset';
import type { SentenceData } from '../src/data/types';

const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
    const i = args.indexOf(name);
    return i >= 0 ? Number(args[i + 1]) : fallback;
};
const file = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--synthetic'));
const seed = flag('--seed', 1);
const count = flag('--sentences', 500);

function load(): { rows: number; dataset: SentenceData[] } {
    if (args.includes('--synthetic')) {
        const all = makeSyntheticDataset(4000, 27, 7);
        return { rows: all.length, dataset: filterPlayable(all) };
    }
    if (!file) { console.error('Usage: npm run analyze -- <file.json|file.jsonl|file.txt> [--seed N] [--sentences N]  |  --synthetic'); process.exit(1); }
    try {
        const { canonical } = loadDatasetText(readFileSync(file, 'utf8')); // same pipeline as drag & drop
        return { rows: canonical.report.rows, dataset: canonical.sentences };
    } catch (err) {
        console.error(err instanceof DatasetParseError ? err.message : err);
        process.exit(1);
    }
}

const { rows, dataset } = load();
if (dataset.length === 0) { console.error('No playable sentences (need at least one valid entity span).'); process.exit(1); }

const stats = profileEntities(dataset);
const order = stats.map(s => s.label);
const lastLabel = order[order.length - 1];
const withLast = dataset.filter(s => s.ner.some(sp => isValidSpan(sp, s.tokenized_text.length) && sp[2] === lastLabel)).length;

console.log(`Sentences: ${rows} loaded, ${dataset.length} playable (${rows - dataset.length} dropped: malformed, no valid entity or duplicate)`);
console.log(`Labels: ${order.length}. Turn unstable first -> last: ${order.slice(0, 4).join(', ')}${order.length > 4 ? ', ...' : ''}`);
console.log(`Never unstable: "${lastLabel}" (in ${withLast} sentences = ${(100 * withLast / dataset.length).toFixed(1)}%)`);
console.log(`Reach rule: rise <= ${REACH.maxRise}px (running apex ${REACH.runningApex.toFixed(0)}px), gap ${REACH.minGap}-${TOWER.sentenceGap}px, seed ${seed}, ${count} placements per phase\n`);

const allPhases = Array.from({ length: order.length }, (_, i) => i);
const shown = allPhases.length <= 12 ? allPhases : allPhases.filter((_, i) => i % Math.ceil(allPhases.length / 12) === 0 || i === allPhases.length - 1);

const byPhase = new Map<number, PlacedSentence[]>();
for (const phase of shown) {
    const planner = new TowerPlanner(dataset, seededRandom(seed), { labelOrder: order, phaseDist: 100, phaseOverride: phase });
    byPhase.set(phase, Array.from({ length: count }, () => planner.next()));
}
const placed = [...byPhase.values()].flat();

const rank = new Map(order.map((l, i) => [l, i]));
const poolSize = (phase: number) => {
    const cutoff = Math.min(phase, order.length - 1);
    return dataset.filter(s => s.ner.some(sp => isValidSpan(sp, s.tokenized_text.length) && (rank.get(sp[2]) ?? Infinity) >= cutoff)).length;
};

console.log('phase | stable labels | pool | sentences | compressed | mean gap | fallback | max entry rise | max inner rise');
for (const ph of shown) {
    const ps = byPhase.get(ph)!;
    const compressed = ps.filter(p => p.gap < TOWER.sentenceGap).length;
    const fallback = ps.filter(p => p.fallback).length;
    const meanGap = ps.reduce((a, p) => a + p.gap, 0) / ps.length;
    const maxEntry = Math.max(...ps.map(p => p.entryRise));
    const maxInner = Math.max(...ps.map(p => p.internalRise));
    console.log(
        `${String(ph).padStart(5)} | ${String(order.length - Math.min(ph, order.length - 1)).padStart(13)} | ${String(poolSize(ph)).padStart(4)} | ${String(ps.length).padStart(9)} | ` +
        `${(100 * compressed / ps.length).toFixed(0).padStart(9)}% | ${meanGap.toFixed(0).padStart(8)} | ${(100 * fallback / ps.length).toFixed(1).padStart(7)}% | ${String(Number.isFinite(maxEntry) ? maxEntry : '-').padStart(14)} | ${String(Number.isFinite(maxInner) ? maxInner : '-').padStart(14)}`
    );
}

const totalFallback = placed.filter(p => p.fallback).length;
console.log('');
if (withLast < 20) console.log(`WARNING: the label that never turns unstable ("${lastLabel}") appears in only ${withLast} sentences; late phases will repeat heavily.`);
if (totalFallback / placed.length > 0.02) console.log(`WARNING: ${(100 * totalFallback / placed.length).toFixed(1)}% of placements needed the best-effort fallback; some climbs may exceed the reach rule (long sentences with sparse entities?).`);
if (withLast >= 20 && totalFallback / placed.length <= 0.02) console.log('OK: no structural problems found.');
