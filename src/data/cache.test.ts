import { describe, it, expect } from 'vitest';
import { DatasetCache, memoryStore, type KeyValueStore } from './cache';
import { canonicalize } from './canonical';
import { makeSyntheticDataset } from './fixtures/synthetic';
import type { LoadedSource } from './sources/types';

const src = { datasetId: 'hf:org/name', version: '1.0' };
const loaded = (n = 30, seed = 1): LoadedSource => ({ canonical: canonicalize(makeSyntheticDataset(n, 5, seed)), rowsRead: n, rowsSkipped: 0 });

describe('DatasetCache', () => {
    it('round-trips a dataset exactly (same ids, same hash)', async () => {
        const cache = new DatasetCache(memoryStore());
        const l = loaded();
        expect(await cache.read(src)).toBeUndefined();
        expect(await cache.write(src, l)).toBe(true);
        expect(await cache.has(src)).toBe(true);
        const back = await cache.read(src);
        expect(back!.canonical.contentHash).toBe(l.canonical.contentHash);
        expect(back!.canonical.sentences).toEqual(l.canonical.sentences);
        expect(back).toMatchObject({ rowsRead: 30, rowsSkipped: 0 });
    });

    it('is keyed by datasetId@version, and a capped load is its own entry', async () => {
        expect(DatasetCache.key(src)).toBe('hf:org/name@1.0');
        expect(DatasetCache.key(src, 50)).toBe('hf:org/name@1.0#50');
        const cache = new DatasetCache(memoryStore());
        await cache.write(src, loaded());
        expect(await cache.read({ ...src, version: '1.1' })).toBeUndefined();
        expect(await cache.read(src, 50)).toBeUndefined();
    });

    it('treats a damaged entry as a miss and removes it', async () => {
        const store = memoryStore();
        const cache = new DatasetCache(store);
        await cache.write(src, loaded());
        const key = DatasetCache.key(src);
        const entry = (await store.get(key)) as { sentences: { tokenized_text: string[] }[] };
        entry.sentences[0].tokenized_text[0] = 'tampered';
        await store.set(key, entry);
        expect(await cache.read(src)).toBeUndefined();
        expect(await store.get(key)).toBeUndefined();
    });

    it('treats an entry from another canonical version, or of the wrong shape, as a miss', async () => {
        const store = memoryStore();
        const cache = new DatasetCache(store);
        await cache.write(src, loaded());
        const key = DatasetCache.key(src);
        await store.set(key, { ...(await store.get(key) as object), canonicalVersion: 999 });
        expect(await cache.read(src)).toBeUndefined();
        await store.set(key, { nonsense: true });
        expect(await cache.read(src)).toBeUndefined();
        expect(await cache.has(src)).toBe(false);
    });

    it('never throws when the store does', async () => {
        const broken: KeyValueStore = { get: async () => { throw new Error('x'); }, set: async () => { throw new Error('quota'); }, delete: async () => { throw new Error('x'); } };
        const cache = new DatasetCache(broken);
        expect(await cache.read(src)).toBeUndefined();
        expect(await cache.has(src)).toBe(false);
        expect(await cache.write(src, loaded())).toBe(false);
        await expect(cache.remove(src)).resolves.toBeUndefined();
    });
});
