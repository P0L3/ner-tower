import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { DatasetCache, indexedDbStore } from './cache';
import { canonicalize } from './canonical';
import { makeSyntheticDataset } from './fixtures/synthetic';

const src = { datasetId: 'hf:org/name', version: '1.0' };

describe('indexedDbStore (against fake-indexeddb)', () => {
    it('stores, reads, overwrites and deletes values', async () => {
        const store = indexedDbStore(new IDBFactory());
        expect(await store.get('k')).toBeUndefined();
        await store.set('k', { a: [1, 2] });
        expect(await store.get('k')).toEqual({ a: [1, 2] });
        await store.set('k', 'v2');
        expect(await store.get('k')).toBe('v2');
        await store.delete('k');
        expect(await store.get('k')).toBeUndefined();
    });

    it('persists across store instances sharing a database, and backs a working DatasetCache', async () => {
        const factory = new IDBFactory();
        const loaded = { canonical: canonicalize(makeSyntheticDataset(60, 6, 4)), rowsRead: 60, rowsSkipped: 0 };
        expect(await new DatasetCache(indexedDbStore(factory)).write(src, loaded)).toBe(true);
        const back = await new DatasetCache(indexedDbStore(factory)).read(src); // "after a reload"
        expect(back!.canonical.contentHash).toBe(loaded.canonical.contentHash);
        expect(back!.canonical.sentences).toEqual(loaded.canonical.sentences);
    });

    it('degrades to a cache miss when the database cannot be opened', async () => {
        const broken = { open: () => { const r: { onerror?: () => void } = {}; setTimeout(() => r.onerror?.(), 0); return r; } } as unknown as IDBFactory;
        const cache = new DatasetCache(indexedDbStore(broken));
        expect(await cache.read(src)).toBeUndefined();
        expect(await cache.write(src, { canonical: canonicalize(makeSyntheticDataset(5, 3, 1)), rowsRead: 5, rowsSkipped: 0 })).toBe(false);
    });
});
