import { describe, it, expect } from 'vitest';
import { loadSource } from './cached';
import { clirenerGold } from './clirener-gold';
import { DatasetCache, memoryStore, type KeyValueStore } from '../cache';
import { fakeDatasetsServer, makeBioRows } from '../hf/fakeServer.testutil';
import type { LoadProgress } from './types';

const server = (intercept?: Parameters<typeof fakeDatasetsServer>[1]) => fakeDatasetsServer({
    dataset: clirenerGold.datasetId,
    splits: { train: makeBioRows(150, 1, 'a'), validation: makeBioRows(21, 2, 'b'), test: makeBioRows(21, 3, 'c') },
}, intercept);
const noSleep = () => Promise.resolve();

describe('loadSource (cache first)', () => {
    it('downloads once, then serves the same dataset without any request', async () => {
        const cache = new DatasetCache(memoryStore());
        const s = server();
        const first = await loadSource(clirenerGold, cache, { fetch: s.fetch, sleep: noSleep });
        expect(first).toMatchObject({ fromCache: false, cacheWriteFailed: false });
        const calls = s.calls.length;
        expect(calls).toBeGreaterThan(0);

        const phases: LoadProgress[] = [];
        const second = await loadSource(clirenerGold, cache, { fetch: s.fetch, sleep: noSleep, onProgress: p => phases.push(p) });
        expect(second.fromCache).toBe(true);
        expect(s.calls).toHaveLength(calls);
        expect(second.canonical.contentHash).toBe(first.canonical.contentHash);
        expect(second.canonical.sentences).toEqual(first.canonical.sentences);
        expect(phases).toEqual([{ phase: 'done' }]);
    });

    it('works offline once cached', async () => {
        const cache = new DatasetCache(memoryStore());
        await loadSource(clirenerGold, cache, { fetch: server().fetch, sleep: noSleep });
        const offline = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
        const again = await loadSource(clirenerGold, cache, { fetch: offline, sleep: noSleep });
        expect(again.fromCache).toBe(true);
        expect(again.canonical.sentences).toHaveLength(192);
    });

    it('does not cache a failed or cancelled load', async () => {
        const cache = new DatasetCache(memoryStore());
        const offline = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
        await expect(loadSource(clirenerGold, cache, { fetch: offline, sleep: noSleep })).rejects.toMatchObject({ kind: 'network' });
        const ctl = new AbortController(); ctl.abort();
        await expect(loadSource(clirenerGold, cache, { fetch: server().fetch, signal: ctl.signal })).rejects.toMatchObject({ kind: 'aborted' });
        expect(await cache.has(clirenerGold)).toBe(false);
    });

    it('still delivers the data when saving fails', async () => {
        const failing: KeyValueStore = { get: async () => undefined, set: async () => { throw new Error('quota'); }, delete: async () => {} };
        const res = await loadSource(clirenerGold, new DatasetCache(failing), { fetch: server().fetch, sleep: noSleep });
        expect(res).toMatchObject({ fromCache: false, cacheWriteFailed: true });
        expect(res.canonical.sentences).toHaveLength(192);
    });
});
