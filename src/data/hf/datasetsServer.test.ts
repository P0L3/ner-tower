import { describe, it, expect } from 'vitest';
import { fetchAllRows, fetchSplits, MAX_PAGE } from './datasetsServer';
import { SourceLoadError } from '../sources/errors';
import { fakeDatasetsServer, makeBioRows } from './fakeServer.testutil';

const DS = 'org/name';
const server = (train = 250, validation = 30, intercept?: Parameters<typeof fakeDatasetsServer>[1]) =>
    fakeDatasetsServer({ dataset: DS, splits: { train: makeBioRows(train, 1, 't'), validation: makeBioRows(validation, 2, 'v') } }, intercept);

const noSleep = () => Promise.resolve();
async function failure(p: Promise<unknown>): Promise<SourceLoadError> {
    try { await p; } catch (e) { if (e instanceof SourceLoadError) return e; throw e; }
    throw new Error('expected a SourceLoadError');
}

describe('fetchAllRows', () => {
    it('downloads every page of every split, in split order, never asking for more than 100 rows', async () => {
        const s = server();
        const { rows, features } = await fetchAllRows(DS, 'default', ['train', 'validation'], { fetch: s.fetch });
        expect(rows).toHaveLength(280);
        expect(rows.slice(0, 250).every((r, i) => r.row.id === `t${i}`)).toBe(true);
        expect(rows.slice(250).every((r, i) => r.row.id === `v${i}`)).toBe(true);
        expect(features.map(f => f.name)).toEqual(['id', 'text', 'tokens', 'ner_tags']);

        const rowCalls = s.calls.filter(u => u.pathname === '/rows');
        expect(rowCalls).toHaveLength(4); // train: 3 pages, validation: 1
        for (const u of rowCalls) {
            expect(u.searchParams.get('dataset')).toBe(DS);
            expect(u.searchParams.get('config')).toBe('default');
            expect(Number(u.searchParams.get('length'))).toBeLessThanOrEqual(MAX_PAGE);
        }
        expect(rowCalls.filter(u => u.searchParams.get('split') === 'train').map(u => u.searchParams.get('offset')).sort()).toEqual(['0', '100', '200']);
    });

    it('reports monotonic progress that ends at the total, with the total known from the first call', async () => {
        const seen: [number, number][] = [];
        await fetchAllRows(DS, 'default', ['train', 'validation'], { fetch: server().fetch }, (l, t) => seen.push([l, t]));
        expect(seen[0]).toEqual([130, 280]);                   // first pages of both splits
        expect(seen.every(([, t]) => t === 280)).toBe(true);
        for (let i = 1; i < seen.length; i++) expect(seen[i][0]).toBeGreaterThan(seen[i - 1][0]);
        expect(seen[seen.length - 1]).toEqual([280, 280]);
    });

    it('limits parallel requests to the configured concurrency, and does use parallelism', async () => {
        const s = server(1000, 0);
        await fetchAllRows(DS, 'default', ['train'], { fetch: s.fetch, concurrency: 3 });
        expect(s.maxInFlight()).toBeLessThanOrEqual(3);
        expect(s.maxInFlight()).toBeGreaterThan(1);
    });

    it('handles an empty split and no splits at all', async () => {
        expect((await fetchAllRows(DS, 'default', ['train', 'validation'], { fetch: server(5, 0).fetch })).rows).toHaveLength(5);
        expect((await fetchAllRows(DS, 'default', [], { fetch: server().fetch })).rows).toEqual([]);
    });
});

describe('fetchAllRows: failures', () => {
    it('retries 5xx with exponential backoff and then succeeds', async () => {
        const waits: number[] = [];
        const s = server(5, 0, (u, n) => (u.pathname === '/rows' && n < 2 ? new Response('busy', { status: 503 }) : undefined));
        const { rows } = await fetchAllRows(DS, 'default', ['train'], { fetch: s.fetch, sleep: async ms => { waits.push(ms); } });
        expect(rows).toHaveLength(5);
        expect(waits).toEqual([400, 800]);
    });

    it('honors Retry-After on 429', async () => {
        const waits: number[] = [];
        const s = server(5, 0, (_u, n) => (n === 0 ? new Response('slow down', { status: 429, headers: { 'retry-after': '2' } }) : undefined));
        await fetchAllRows(DS, 'default', ['train'], { fetch: s.fetch, sleep: async ms => { waits.push(ms); } });
        expect(waits).toEqual([2000]);
    });

    it('gives up after the configured attempts with an http error that can be shown to a user', async () => {
        const s = server(5, 0, () => new Response('boom', { status: 500 }));
        const e = await failure(fetchAllRows(DS, 'default', ['train'], { fetch: s.fetch, sleep: noSleep, attempts: 3 }));
        expect(e.kind).toBe('http');
        expect(e.status).toBe(500);
        expect(e.message).toMatch(/having trouble/);
        expect(s.calls).toHaveLength(3);
    });

    it('does not retry client errors, and explains 404 and 403', async () => {
        const notFound = server();
        const e404 = await failure(fetchAllRows('nope/nope', 'default', ['train'], { fetch: notFound.fetch, sleep: noSleep }));
        expect(e404).toMatchObject({ kind: 'http', status: 404 });
        expect(e404.message).toMatch(/not found/i);
        expect(notFound.calls).toHaveLength(1);

        const e403 = await failure(fetchAllRows(DS, 'default', ['train'], { fetch: server(5, 0, () => new Response('', { status: 403 })).fetch, sleep: noSleep }));
        expect(e403.message).toMatch(/private or gated/);
    });

    it('turns network failures into a readable error after retrying', async () => {
        let calls = 0;
        const failing = (async () => { calls++; throw new TypeError('Failed to fetch'); }) as typeof fetch;
        const e = await failure(fetchAllRows(DS, 'default', ['train'], { fetch: failing, sleep: noSleep }));
        expect(e.kind).toBe('network');
        expect(e.message).toMatch(/Could not reach Hugging Face/);
        expect(calls).toBe(3);
    });

    it('stops immediately when aborted, before or during a request', async () => {
        const s = server();
        const ctl = new AbortController(); ctl.abort();
        expect((await failure(fetchAllRows(DS, 'default', ['train'], { fetch: s.fetch, signal: ctl.signal }))).kind).toBe('aborted');
        expect(s.calls).toHaveLength(0);

        const aborting = (async () => { throw new DOMException('aborted', 'AbortError'); }) as typeof fetch;
        expect((await failure(fetchAllRows(DS, 'default', ['train'], { fetch: aborting, sleep: noSleep }))).kind).toBe('aborted');
    });

    it('rejects payloads that are not what the viewer promises', async () => {
        const bad = (body: unknown) => server(5, 0, () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 }));
        for (const body of ['<html>nope</html>', { rows: [] }, { features: [], rows: 'x', num_rows_total: 1 }, { features: [], rows: [{ nope: 1 }], num_rows_total: 1 }]) {
            expect((await failure(fetchAllRows(DS, 'default', ['train'], { fetch: bad(body).fetch, sleep: noSleep }))).kind).toBe('schema');
        }
        const truncated = server(5, 0, () => new Response(JSON.stringify({ features: [], num_rows_total: 1, rows: [{ row_idx: 0, row: {}, truncated_cells: ['tokens'] }] }), { status: 200 }));
        expect((await failure(fetchAllRows(DS, 'default', ['train'], { fetch: truncated.fetch, sleep: noSleep }))).message).toMatch(/truncated/);
    });
});

describe('fetchSplits', () => {
    it('lists config/split pairs', async () => {
        expect(await fetchSplits(DS, { fetch: server().fetch })).toEqual([{ config: 'default', split: 'train' }, { config: 'default', split: 'validation' }]);
    });
    it('rejects a payload without splits', async () => {
        const e = await failure(fetchSplits(DS, { fetch: server(5, 0, () => new Response('{"splits": 3}', { status: 200 })).fetch, sleep: noSleep }));
        expect(e.kind).toBe('schema');
    });
});
