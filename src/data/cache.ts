import { canonicalize, CANONICAL_VERSION, type CanonicalReport } from './canonical';
import type { SentenceData } from './types';
import type { LoadedSource } from './sources/types';

/**
 * Offline cache for curated datasets (IndexedDB in the browser). It stores the CANONICAL
 * sentences, so a cache hit skips the network, the BIO decoding and the canonicalization sort.
 *
 * Nothing here can change what a seed produces: an entry is only used if re-canonicalizing its
 * sentences reproduces the stored content hash, so a damaged or outdated entry is a cache miss.
 * Every failure (no IndexedDB, quota, private mode) degrades to "no cache"; it never blocks play.
 */

/** The little storage surface the cache needs. Async because IndexedDB is. */
export interface KeyValueStore {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
}

/** In-memory store: tests, and the fallback when IndexedDB is missing (cache lasts one session). */
export function memoryStore(): KeyValueStore {
    const map = new Map<string, unknown>();
    return {
        get: async k => (map.has(k) ? structuredClone(map.get(k)) : undefined),
        set: async (k, v) => { map.set(k, structuredClone(v)); },
        delete: async k => { map.delete(k); },
    };
}

const DB_NAME = 'ner-tower';
const STORE = 'datasets';

const asPromise = <T>(req: IDBRequest<T>) =>
    new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

/** IndexedDB-backed store. The database is opened lazily, once; a failed open rejects every call. */
export function indexedDbStore(factory: IDBFactory = indexedDB): KeyValueStore {
    let opened: Promise<IDBDatabase> | undefined;
    const open = () => opened ??= new Promise<IDBDatabase>((resolve, reject) => {
        const req = factory.open(DB_NAME, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('IndexedDB open blocked'));
    });
    const run = async <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
        const db = await open();
        const tx = db.transaction(STORE, mode);
        const result = asPromise(f(tx.objectStore(STORE)));
        await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
        return result;
    };
    return {
        get: k => run('readonly', s => s.get(k)),
        set: async (k, v) => { await run('readwrite', s => s.put(v, k)); },
        delete: async k => { await run('readwrite', s => s.delete(k)); },
    };
}

/** Real cache for the browser; falls back to a session-only cache where IndexedDB does not exist. */
export function createDefaultCache(): DatasetCache {
    return new DatasetCache(typeof indexedDB === 'undefined' ? memoryStore() : indexedDbStore());
}

/** What a source needs to provide to be cached. */
export interface CacheableSource { datasetId: string; version: string }

/** Stored shape. `schema` is the layout of this record, not a ruleset version. */
interface CacheEntry {
    schema: 1;
    datasetId: string;
    version: string;
    canonicalVersion: number;
    maxSentences: number | null;
    contentHash: string;
    sentences: SentenceData[];
    report: CanonicalReport;
    rowsRead: number;
    rowsSkipped: number;
    savedAt: number;
}

const isEntry = (v: unknown): v is CacheEntry => {
    if (v === null || typeof v !== 'object') return false;
    const e = v as Partial<CacheEntry>;
    return e.schema === 1 && typeof e.datasetId === 'string' && typeof e.version === 'string'
        && typeof e.canonicalVersion === 'number' && typeof e.contentHash === 'string'
        && Array.isArray(e.sentences) && e.sentences.length > 0 && typeof e.report === 'object' && e.report !== null
        && typeof e.rowsRead === 'number' && typeof e.rowsSkipped === 'number';
};

export class DatasetCache {
    private readonly store: KeyValueStore;
    constructor(store: KeyValueStore) { this.store = store; }

    /** `datasetId@version`, plus `#cap` for a capped load (a capped set is a different dataset). */
    static key(source: CacheableSource, maxSentences?: number): string {
        return `${source.datasetId}@${source.version}` + (maxSentences !== undefined ? `#${maxSentences}` : '');
    }

    /** The cached dataset, or undefined for a miss. Invalid entries are deleted. Never throws. */
    async read(source: CacheableSource, maxSentences?: number): Promise<LoadedSource | undefined> {
        const key = DatasetCache.key(source, maxSentences);
        try {
            const raw = await this.store.get(key);
            if (raw === undefined) return undefined;
            if (isEntry(raw)
                && raw.datasetId === source.datasetId && raw.version === source.version
                && raw.canonicalVersion === CANONICAL_VERSION && raw.maxSentences === (maxSentences ?? null)
                && canonicalize(raw.sentences).contentHash === raw.contentHash) {
                return {
                    canonical: { sentences: raw.sentences, contentHash: raw.contentHash, report: raw.report },
                    rowsRead: raw.rowsRead, rowsSkipped: raw.rowsSkipped,
                };
            }
            await this.store.delete(key);
        } catch { /* unreadable store = miss */ }
        return undefined;
    }

    /** Cheap existence check for the menu badge (does not verify the content). */
    async has(source: CacheableSource, maxSentences?: number): Promise<boolean> {
        try { return isEntry(await this.store.get(DatasetCache.key(source, maxSentences))); } catch { return false; }
    }

    /** Returns false if the entry could not be stored. Never throws. */
    async write(source: CacheableSource, loaded: LoadedSource, maxSentences?: number): Promise<boolean> {
        const entry: CacheEntry = {
            schema: 1, datasetId: source.datasetId, version: source.version, canonicalVersion: CANONICAL_VERSION,
            maxSentences: maxSentences ?? null, contentHash: loaded.canonical.contentHash,
            sentences: loaded.canonical.sentences, report: loaded.canonical.report,
            rowsRead: loaded.rowsRead, rowsSkipped: loaded.rowsSkipped, savedAt: Date.now(),
        };
        try { await this.store.set(DatasetCache.key(source, maxSentences), entry); return true; } catch { return false; }
    }

    async remove(source: CacheableSource, maxSentences?: number): Promise<void> {
        try { await this.store.delete(DatasetCache.key(source, maxSentences)); } catch { /* ignore */ }
    }
}
