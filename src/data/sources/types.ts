import type { CanonicalDataset } from '../canonical';

export type LoadPhase = 'discover' | 'download' | 'parse' | 'done';

export interface LoadProgress {
    phase: LoadPhase;
    /** Rows downloaded so far / expected in total (download phase only). */
    loaded?: number;
    total?: number;
}

export interface LoadOptions {
    onProgress?: (p: LoadProgress) => void;
    signal?: AbortSignal;
    /** Keep at most this many sentences (deterministic, see canonicalize). Default: all. */
    maxSentences?: number;
    /** Test hooks. */
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
}

export interface LoadedSource {
    canonical: CanonicalDataset;
    /** Rows the source delivered / rows that could not be decoded. */
    rowsRead: number;
    rowsSkipped: number;
}

/**
 * A curated dataset the menu can offer. One small file per source (see clirener-gold.ts);
 * the format quirks of a dataset stay inside its file.
 */
export interface DatasetSource {
    /** Stable key, used in URLs and caches: 'clirener-gold'. */
    id: string;
    /** Identity of the data for share codes and boards (final shape is decided in M4): 'hf:P0L3/...'. */
    datasetId: string;
    title: string;
    description: string;
    license: string;
    /** Where the data lives, for attribution. */
    url: string;
    /** Version of the upstream dataset as named by its authors. */
    version: string;
    /** Label colors; labels not listed get generated colors. */
    palette?: Readonly<Record<string, number>>;
    /** Sentence count the authors report. Only used by the live smoke test to notice drift. */
    expectedRows?: number;
    load(options?: LoadOptions): Promise<LoadedSource>;
}
