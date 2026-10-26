import { describe, it, expect } from 'vitest';
import { isValidDatasetId } from '../../config/settings';
import { SOURCES, HUB_SOURCES, getSource, SourceLoadError, type LoadProgress } from './index';
import { demo } from './demo';
import { clirenerGold } from './clirener-gold';
import { clirenerSilver } from './clirener-silver';
import { CLIRENER_PALETTE } from './clirener-palette';
import { CLIRENER_TYPES, fakeDatasetsServer, makeBioRows, type FakeDataset, type Intercept } from '../hf/fakeServer.testutil';

const repoOf = (s: { datasetId: string }) => s.datasetId;
const noSleep = () => Promise.resolve();

/** Gold-sized fake: 150 + 21 + 21 rows over train/validation/test. */
function goldServer(intercept?: Intercept, splits?: FakeDataset['splits']) {
    return fakeDatasetsServer({
        dataset: repoOf(clirenerGold),
        splits: splits ?? { train: makeBioRows(150, 1, 'a'), validation: makeBioRows(21, 2, 'b'), test: makeBioRows(21, 3, 'c') },
    }, intercept);
}

describe('curated source: CliReNER gold (against a fake viewer)', () => {
    it('plays all splits together and decodes every label to one of the 28 types', async () => {
        const phases: LoadProgress[] = [];
        const s = goldServer();
        const loaded = await clirenerGold.load({ fetch: s.fetch, sleep: noSleep, onProgress: p => phases.push(p) });

        expect(loaded.rowsRead).toBe(192);
        expect(loaded.rowsSkipped).toBe(0);
        expect(loaded.canonical.sentences).toHaveLength(192);
        expect(loaded.canonical.contentHash).toMatch(/^[0-9a-f]{64}$/);
        const labels = new Set(loaded.canonical.sentences.flatMap(x => x.ner.map(sp => sp[2])));
        expect(labels.size).toBeGreaterThan(10);
        for (const l of labels) expect(CLIRENER_TYPES).toContain(l);

        expect(phases[0].phase).toBe('discover');
        expect(phases.at(-1)!.phase).toBe('done');
        expect(phases.map(p => p.phase)).toEqual([...phases.map(p => p.phase)].sort((a, b) => ['discover', 'download', 'parse', 'done'].indexOf(a) - ['discover', 'download', 'parse', 'done'].indexOf(b)));
        expect(phases.filter(p => p.phase === 'download').at(-1)).toMatchObject({ loaded: 192, total: 192 });
    });

    it('produces the same dataset hash no matter how the viewer orders the splits', async () => {
        const a = await clirenerGold.load({ fetch: goldServer().fetch, sleep: noSleep });
        const reversed = goldServer(undefined, { test: makeBioRows(21, 3, 'c'), validation: makeBioRows(21, 2, 'b'), train: makeBioRows(150, 1, 'a') });
        const b = await clirenerGold.load({ fetch: reversed.fetch, sleep: noSleep });
        expect(b.canonical.contentHash).toBe(a.canonical.contentHash);
        expect(b.canonical.sentences.map(x => x.id)).toEqual(a.canonical.sentences.map(x => x.id));
    });

    it('uses the splits the viewer reports, even when they are not called validation', async () => {
        const s = goldServer(undefined, { train: makeBioRows(40, 1, 'a'), dev: makeBioRows(10, 2, 'b'), test: makeBioRows(10, 3, 'c') });
        expect((await clirenerGold.load({ fetch: s.fetch, sleep: noSleep })).rowsRead).toBe(60);
    });

    it('falls back to the known splits when the viewer cannot list them, but not when it is unreachable', async () => {
        const noSplitsEndpoint: Intercept = u => (u.pathname === '/splits' ? new Response('nope', { status: 500 }) : undefined);
        const s = goldServer(noSplitsEndpoint);
        expect((await clirenerGold.load({ fetch: s.fetch, sleep: noSleep })).rowsRead).toBe(192);
        expect(s.calls.filter(u => u.pathname === '/splits')).toHaveLength(3); // retried, then gave up

        const offline = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
        await expect(clirenerGold.load({ fetch: offline, sleep: noSleep })).rejects.toMatchObject({ kind: 'network' });
    });

    it('applies a deterministic sentence cap', async () => {
        const a = await clirenerGold.load({ fetch: goldServer().fetch, sleep: noSleep, maxSentences: 50 });
        const b = await clirenerGold.load({ fetch: goldServer().fetch, sleep: noSleep, maxSentences: 50 });
        expect(a.canonical.sentences).toHaveLength(50);
        expect(b.canonical.contentHash).toBe(a.canonical.contentHash);
    });

    it('collapses sentences that appear in several splits', async () => {
        const dup = makeBioRows(30, 9, 'x');
        const s = goldServer(undefined, { train: dup, validation: dup.slice(0, 10), test: [] });
        const loaded = await clirenerGold.load({ fetch: s.fetch, sleep: noSleep });
        expect(loaded.rowsRead).toBe(40);
        expect(loaded.canonical.sentences).toHaveLength(30);
        expect(loaded.canonical.report.droppedDuplicate).toBe(10);
    });

    it('fails with a clear message when the data has an unexpected layout', async () => {
        const wrong = Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, sentence: 'x', labels: [1] }));
        const s = goldServer(undefined, { train: wrong });
        const e = await clirenerGold.load({ fetch: s.fetch, sleep: noSleep }).catch(x => x);
        expect(e).toBeInstanceOf(SourceLoadError);
        expect(e).toMatchObject({ kind: 'empty' });
        expect(e.message).toContain(repoOf(clirenerGold));
    });

    it('can be cancelled', async () => {
        const ctl = new AbortController(); ctl.abort();
        await expect(clirenerGold.load({ fetch: goldServer().fetch, signal: ctl.signal })).rejects.toMatchObject({ kind: 'aborted' });
    });
});

describe('source registry', () => {
    it('has unique ids and dataset ids, and complete attribution', () => {
        expect(new Set(SOURCES.map(s => s.id)).size).toBe(SOURCES.length);
        expect(new Set(SOURCES.map(s => s.datasetId)).size).toBe(SOURCES.length);
        for (const s of SOURCES) {
            expect(isValidDatasetId(s.datasetId)).toBe(true);
            expect(s.datasetId).toContain('/');
            for (const field of [s.title, s.description, s.license, s.version]) expect(field.trim()).not.toBe('');
        }
        for (const s of HUB_SOURCES) expect(s.url).toBe(`https://huggingface.co/datasets/${repoOf(s)}`);
    });

    it('a pinned Classic hash is 16 lowercase hex characters', () => {
        for (const s of SOURCES) if (s.classicHash !== undefined) expect(s.classicHash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('lists the built-in demo last, so a Hub dataset stays the default', () => {
        expect(SOURCES.at(-1)).toBe(demo);
        expect(HUB_SOURCES).toEqual(SOURCES.slice(0, -1));
    });

    it('looks sources up by id', () => {
        expect(getSource('clirener-gold')).toBe(clirenerGold);
        expect(getSource('clirener-silver')).toBe(clirenerSilver);
        expect(getSource('nope')).toBeUndefined();
    });

    it('declares the sizes from the dataset cards (gold 150+21+21, silver 803+106+118)', () => {
        expect(clirenerGold.expectedRows).toBe(150 + 21 + 21);
        expect(clirenerSilver.expectedRows).toBe(803 + 106 + 118);
    });

    it('has a color for each of the 28 CliReNER types and none for typos', () => {
        expect(Object.keys(CLIRENER_PALETTE).sort()).toEqual([...CLIRENER_TYPES].sort());
        expect(clirenerGold.palette).toBe(CLIRENER_PALETTE);
        expect(clirenerSilver.palette).toBe(CLIRENER_PALETTE);
    });
});
