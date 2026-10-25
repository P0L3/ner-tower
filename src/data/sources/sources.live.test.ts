/**
 * LIVE smoke test: talks to the real Hugging Face dataset viewer. Not part of `npm test`.
 *
 *   npm run test:live
 *
 * Run it when you add or change a source, and now and then to notice upstream drift. It checks
 * what the mocked tests cannot: the real schema, the real sizes, and that the server sends the
 * CORS header a browser needs (the single-file build runs from a page or from file://).
 */
import { describe, it, expect } from 'vitest';
import { SOURCES, type LoadProgress } from './index';
import { HF_DATASETS_SERVER } from '../hf/datasetsServer';
import { CLIRENER_TYPES } from '../hf/fakeServer.testutil';

describe.each(SOURCES.map(s => [s.id, s] as const))('live: %s', (_id, source) => {
    const repo = source.datasetId;

    it('sends a CORS header that allows browsers (including file:// pages, whose origin is "null")', async () => {
        const res = await fetch(`${HF_DATASETS_SERVER}/splits?dataset=${encodeURIComponent(repo)}`, { headers: { Origin: 'null' } });
        expect(res.status, `GET /splits answered ${res.status}`).toBe(200);
        const allow = res.headers.get('access-control-allow-origin');
        console.info(`[${source.id}] access-control-allow-origin: ${allow}`);
        expect(allow === '*' || allow === 'null', `a browser would block this: access-control-allow-origin is "${allow}"`).toBe(true);
    });

    it('loads, decodes and matches the size the authors report', async () => {
        const phases: LoadProgress[] = [];
        const t0 = Date.now();
        const loaded = await source.load({ onProgress: p => phases.push(p) });
        const { canonical } = loaded;
        const r = canonical.report;
        console.info(
            `[${source.id}] ${loaded.rowsRead} rows read, ${canonical.sentences.length} playable ` +
            `(dropped: ${r.droppedNoEntity} no entity, ${r.droppedDuplicate} duplicate, ${r.droppedMalformed} malformed, ${loaded.rowsSkipped} undecodable; ` +
            `${r.spansOverlapping} overlapping + ${r.spansInvalid} invalid spans) in ${Date.now() - t0} ms\n` +
            `[${source.id}] content hash ${canonical.contentHash}`);

        if (source.expectedRows !== undefined) {
            expect(loaded.rowsRead, `upstream has ${loaded.rowsRead} rows but the source declares ${source.expectedRows}: did the dataset change? Update expectedRows if so.`).toBe(source.expectedRows);
        }
        expect(loaded.rowsSkipped).toBe(0);
        expect(canonical.sentences.length).toBeGreaterThanOrEqual(Math.floor((source.expectedRows ?? 1) * 0.9));
        const labels = new Set(canonical.sentences.flatMap(s => s.ner.map(sp => sp[2])));
        console.info(`[${source.id}] ${labels.size} labels in use`);
        for (const l of labels) expect(CLIRENER_TYPES, `unexpected label "${l}"`).toContain(l);
        expect(phases.at(-1)?.phase).toBe('done');
    }, 120_000);
});
