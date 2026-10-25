import type { DatasetCache } from '../cache';
import type { DatasetSource, LoadOptions, LoadedSource } from './types';

export interface CachedLoad extends LoadedSource {
    /** True if the data came from the local cache and no request was made. */
    fromCache: boolean;
    /** True if the download worked but could not be saved for next time. */
    cacheWriteFailed: boolean;
}

/**
 * Cache first, network second. A hit costs no request, so a source works offline once it has been
 * loaded. A miss loads from the source and saves the result; failing to save never fails the load.
 * Cache entries are keyed by `datasetId@version` (+ cap), so bumping a source's `version`
 * is how a new upstream release is picked up.
 */
export async function loadSource(source: DatasetSource, cache: DatasetCache, options: LoadOptions = {}): Promise<CachedLoad> {
    const hit = await cache.read(source, options.maxSentences);
    if (hit) {
        options.onProgress?.({ phase: 'done' });
        return { ...hit, fromCache: true, cacheWriteFailed: false };
    }
    const loaded = await source.load(options); // throws SourceLoadError: nothing gets cached
    const saved = await cache.write(source, loaded, options.maxSentences);
    return { ...loaded, fromCache: false, cacheWriteFailed: !saved };
}
