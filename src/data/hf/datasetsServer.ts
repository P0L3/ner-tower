import { SourceLoadError } from '../sources/errors';

/**
 * Minimal client for the Hugging Face dataset viewer API (https://datasets-server.huggingface.co),
 * which serves any public dataset with a viewer as JSON, in slices of at most 100 rows. It needs
 * no token for public datasets and no Python or parquet reader. Docs:
 * https://huggingface.co/docs/dataset-viewer/rows and /splits.
 */
export const HF_DATASETS_SERVER = 'https://datasets-server.huggingface.co';
export const MAX_PAGE = 100;

export interface HfFeature { feature_idx?: number; name: string; type: unknown }
export interface HfRow { row_idx: number; row: Record<string, unknown>; truncated_cells?: string[] }
interface RowsResponse { features: HfFeature[]; rows: HfRow[]; num_rows_total: number }
export interface HfSplit { config: string; split: string }

export interface HfClientOptions {
    /** Override for tests or a proxy. */
    baseUrl?: string;
    fetch?: typeof fetch;
    signal?: AbortSignal;
    /** Attempts per request (first try included). */
    attempts?: number;
    /** Injectable for tests; defaults to a real timer. */
    sleep?: (ms: number) => Promise<void>;
    /** Parallel page requests. */
    concurrency?: number;
}

export type DownloadProgress = (loaded: number, total: number) => void;

const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function isAbort(e: unknown): boolean {
    return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'AbortError';
}

/** GET + JSON with retries on network errors, 429 and 5xx (exponential backoff, honors Retry-After). */
async function getJson(url: string, opts: HfClientOptions): Promise<unknown> {
    const doFetch = opts.fetch ?? fetch;
    const sleep = opts.sleep ?? defaultSleep;
    const attempts = Math.max(1, opts.attempts ?? 3);
    let lastError: SourceLoadError | undefined;

    for (let attempt = 0; attempt < attempts; attempt++) {
        if (opts.signal?.aborted) throw new SourceLoadError('aborted', 'Loading was cancelled.');
        let waitMs = 400 * 2 ** attempt;
        try {
            const res = await doFetch(url, { signal: opts.signal, headers: { Accept: 'application/json' } });
            if (res.ok) {
                try { return await res.json(); }
                catch { throw new SourceLoadError('schema', 'Hugging Face returned something that is not JSON.'); }
            }
            const retryAfter = Number(res.headers.get('retry-after'));
            if (Number.isFinite(retryAfter) && retryAfter > 0) waitMs = Math.min(retryAfter * 1000, 10_000);
            const retryable = res.status === 429 || res.status >= 500;
            lastError = new SourceLoadError('http', httpMessage(res.status), res.status);
            if (!retryable) throw lastError;
        } catch (e) {
            if (e instanceof SourceLoadError) {
                if (e.kind !== 'http' || (e.status !== undefined && e.status < 500 && e.status !== 429)) throw e;
                lastError = e;
            } else if (isAbort(e) || opts.signal?.aborted) {
                throw new SourceLoadError('aborted', 'Loading was cancelled.');
            } else {
                lastError = new SourceLoadError('network', 'Could not reach Hugging Face. Check your connection and try again.');
            }
        }
        if (attempt < attempts - 1) await sleep(waitMs);
    }
    throw lastError!;
}

function httpMessage(status: number): string {
    if (status === 404) return 'Dataset not found on Hugging Face (is it public and does it have a viewer?).';
    if (status === 401 || status === 403) return 'This dataset is private or gated, so it cannot be loaded in the browser.';
    if (status === 429) return 'Hugging Face is rate limiting requests. Please wait a moment and retry.';
    if (status >= 500) return `Hugging Face is having trouble (HTTP ${status}). Please retry in a moment.`;
    return `Hugging Face rejected the request (HTTP ${status}).`;
}

const url = (base: string, path: string, params: Record<string, string | number>) => {
    const u = new URL(path, base);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    return u.toString();
};

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const schemaError = (what: string) => new SourceLoadError('schema', `Unexpected response from Hugging Face (${what}).`);

/** Lists the (config, split) pairs the viewer knows for a dataset. */
export async function fetchSplits(dataset: string, opts: HfClientOptions = {}): Promise<HfSplit[]> {
    const json = await getJson(url(opts.baseUrl ?? HF_DATASETS_SERVER, '/splits', { dataset }), opts);
    if (!isObject(json) || !Array.isArray(json.splits)) throw schemaError('splits');
    return json.splits.flatMap((s): HfSplit[] =>
        isObject(s) && typeof s.config === 'string' && typeof s.split === 'string' ? [{ config: s.config, split: s.split }] : []);
}

async function fetchPage(dataset: string, config: string, split: string, offset: number, opts: HfClientOptions): Promise<RowsResponse> {
    const json = await getJson(url(opts.baseUrl ?? HF_DATASETS_SERVER, '/rows', { dataset, config, split, offset, length: MAX_PAGE }), opts);
    if (!isObject(json) || !Array.isArray(json.rows) || !Array.isArray(json.features) || typeof json.num_rows_total !== 'number') {
        throw schemaError('rows');
    }
    const rows: HfRow[] = [];
    for (const r of json.rows) {
        if (!isObject(r) || !isObject(r.row)) throw schemaError('row');
        if (Array.isArray(r.truncated_cells) && r.truncated_cells.length > 0) {
            throw new SourceLoadError('schema', 'Hugging Face truncated some cells of this dataset, so it cannot be used.');
        }
        rows.push({ row_idx: typeof r.row_idx === 'number' ? r.row_idx : offset + rows.length, row: r.row });
    }
    return { features: json.features as HfFeature[], rows, num_rows_total: json.num_rows_total };
}

export interface DownloadedRows {
    features: HfFeature[];
    /** All rows of the requested splits, in the order of `splits`, then row order. */
    rows: HfRow[];
}

/**
 * Downloads every row of the given splits. The first page of each split is fetched up front (it
 * carries the totals, so progress is accurate), the remaining pages in parallel.
 */
export async function fetchAllRows(
    dataset: string, config: string, splits: readonly string[], opts: HfClientOptions = {}, onProgress?: DownloadProgress,
): Promise<DownloadedRows> {
    const pages: HfRow[][][] = splits.map(() => []);
    const totals: number[] = [];
    let features: HfFeature[] | undefined;
    let loaded = 0;

    for (let s = 0; s < splits.length; s++) {
        const first = await fetchPage(dataset, config, splits[s], 0, opts);
        features ??= first.features;
        totals.push(first.num_rows_total);
        pages[s][0] = first.rows;
        loaded += first.rows.length;
    }
    const total = totals.reduce((a, b) => a + b, 0);
    onProgress?.(loaded, total);

    const jobs: { s: number; page: number; offset: number }[] = [];
    totals.forEach((n, s) => { for (let off = MAX_PAGE; off < n; off += MAX_PAGE) jobs.push({ s, page: off / MAX_PAGE, offset: off }); });

    let next = 0;
    const worker = async () => {
        while (next < jobs.length) {
            const job = jobs[next++];
            const res = await fetchPage(dataset, config, splits[job.s], job.offset, opts);
            pages[job.s][job.page] = res.rows;
            loaded += res.rows.length;
            onProgress?.(loaded, total);
        }
    };
    await Promise.all(Array.from({ length: Math.min(Math.max(1, opts.concurrency ?? 4), jobs.length) }, worker));

    return { features: features ?? [], rows: pages.flat(2) };
}
