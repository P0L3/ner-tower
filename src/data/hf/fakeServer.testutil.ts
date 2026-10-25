import { seededRandom } from '../../core/rng';
import type { HfFeature } from './datasetsServer';

/** The 28 CliReNER entity types in label order, as in the dataset cards. */
export const CLIRENER_TYPES = ['Asset', 'Body Part', 'Body of Water', 'Chemical', 'Disease', 'Ecosystem', 'Energy Source', 'Field of Study', 'Geographical Feature', 'Intellectual Artefact', 'Location', 'Mathematical Expression', 'Measuring Device', 'Meteorological Phenomenon', 'Method', 'Natural Disaster', 'Natural Phenomenon', 'Organism', 'Organization', 'Other', 'Person', 'Physical Artefact', 'Physical Phenomenon', 'Policy', 'Quantity', 'Satellite', 'System', 'Time Period'];
/** ClassLabel names: 0 = O, then B-/I- per type (57 in total), as in the dataset cards. */
export const CLIRENER_LABEL_NAMES = ['O', ...CLIRENER_TYPES.flatMap(t => ['B-' + t, 'I-' + t])];

/** Features as the viewer API reports them for a `tokens` + `ner_tags` dataset. */
export function bioFeatures(listType: 'List' | 'Sequence' = 'List'): HfFeature[] {
    return [
        { feature_idx: 0, name: 'id', type: { dtype: 'string', _type: 'Value' } },
        { feature_idx: 1, name: 'text', type: { dtype: 'string', _type: 'Value' } },
        { feature_idx: 2, name: 'tokens', type: { feature: { dtype: 'string', _type: 'Value' }, _type: listType } },
        { feature_idx: 3, name: 'ner_tags', type: { feature: { names: CLIRENER_LABEL_NAMES, _type: 'ClassLabel' }, _type: listType } },
    ];
}

/** Deterministic rows in the dataset layout; every row has distinct content and at least one entity. */
export function makeBioRows(n: number, seed: number, idPrefix = 'r'): Record<string, unknown>[] {
    const r = seededRandom(seed);
    return Array.from({ length: n }, (_, i) => {
        const len = 5 + Math.floor(r() * 8);
        const tokens = Array.from({ length: len }, (_, j) => `w${seed}_${i}_${j}`);
        const tags: number[] = [];
        for (let j = 0; j < len; j++) {
            if (r() < 0.3) {
                const type = Math.floor(r() * CLIRENER_TYPES.length);
                tags.push(1 + type * 2);
                if (j + 1 < len && r() < 0.5) { tags.push(2 + type * 2); j++; }
            } else tags.push(0);
        }
        if (tags.reduce((a, b) => a + b, 0) === 0) tags[0] = 1 + Math.floor(r() * CLIRENER_TYPES.length) * 2; // always playable
        return { id: `${idPrefix}${i}`, text: tokens.join(' '), tokens, ner_tags: tags };
    });
}

export interface FakeDataset {
    dataset: string;
    config?: string;
    features?: HfFeature[];
    splits: Record<string, Record<string, unknown>[]>;
}

export type Intercept = (url: URL, callIndex: number) => Response | Error | Promise<Response | Error | undefined> | undefined;

export interface FakeServer {
    fetch: typeof fetch;
    /** Every request URL, in order. */
    calls: URL[];
    /** Highest number of requests in flight at once. */
    maxInFlight: () => number;
}

const json = (body: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

/** A stand-in for datasets-server.huggingface.co serving /splits and /rows (max 100 rows per slice). */
export function fakeDatasetsServer(ds: FakeDataset, intercept?: Intercept): FakeServer {
    const config = ds.config ?? 'default';
    const calls: URL[] = [];
    let inFlight = 0, maxInFlight = 0;

    const fakeFetch = (async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        const n = calls.push(url) - 1;
        inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
        try {
            if (intercept) {
                const hijacked = await intercept(url, n);
                if (hijacked instanceof Error) throw hijacked;
                if (hijacked) return hijacked;
            }
            await new Promise(r => setTimeout(r, 1)); // let parallel requests overlap
            if (url.searchParams.get('dataset') !== ds.dataset) return json({ error: 'not found' }, { status: 404 });

            if (url.pathname === '/splits') {
                return json({ splits: Object.keys(ds.splits).map(split => ({ dataset: ds.dataset, config, split })), pending: [], failed: [] });
            }
            if (url.pathname === '/rows') {
                const rows = ds.splits[url.searchParams.get('split') ?? ''];
                if (url.searchParams.get('config') !== config || !rows) return json({ error: 'not found' }, { status: 404 });
                const offset = Number(url.searchParams.get('offset'));
                const length = Math.min(100, Number(url.searchParams.get('length')));
                return json({
                    features: ds.features ?? bioFeatures(),
                    rows: rows.slice(offset, offset + length).map((row, i) => ({ row_idx: offset + i, row, truncated_cells: [] })),
                    num_rows_total: rows.length, num_rows_per_page: 100, partial: false,
                });
            }
            return json({ error: 'unknown endpoint' }, { status: 404 });
        } finally { inFlight--; }
    }) as typeof fetch;

    return { fetch: fakeFetch, calls, maxInFlight: () => maxInFlight };
}
