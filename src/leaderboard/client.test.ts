import { describe, it, expect } from 'vitest';
import { LeaderboardClient, LeaderboardError } from './client';
import { leaderboardUrl } from './config';

const sub = { boardKey: 'a'.repeat(32), playerId: 'b'.repeat(32), nickname: 'Ada', score: 12 };
const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const clientWith = (f: typeof fetch, timeoutMs?: number) => new LeaderboardClient('https://lb.test/', { fetch: f, timeoutMs });
async function failure(p: Promise<unknown>): Promise<LeaderboardError> {
    try { await p; } catch (e) { if (e instanceof LeaderboardError) return e; throw e; }
    throw new Error('expected a LeaderboardError');
}

describe('leaderboardUrl', () => {
    it('accepts http(s) URLs, trims, drops trailing slashes; anything else disables the leaderboard', () => {
        expect(leaderboardUrl({ VITE_LEADERBOARD_URL: ' https://a.workers.dev/ ' })).toBe('https://a.workers.dev');
        expect(leaderboardUrl({ VITE_LEADERBOARD_URL: 'http://localhost:8787' })).toBe('http://localhost:8787');
        for (const v of [undefined, '', '   ', 'a.workers.dev', 'ftp://x', 5]) expect(leaderboardUrl({ VITE_LEADERBOARD_URL: v }), String(v)).toBeUndefined();
    });
});

describe('LeaderboardClient', () => {
    it('posts a submission as JSON and parses the answer', async () => {
        let seen: { url: string; init: RequestInit } | undefined;
        const c = clientWith((async (url: string, init: RequestInit) => { seen = { url, init }; return jsonRes({ best: 12, improved: true, rank: 1, total: 1 }); }) as unknown as typeof fetch);
        expect(await c.submit(sub)).toEqual({ best: 12, improved: true, rank: 1, total: 1 });
        expect(seen!.url).toBe('https://lb.test/scores');
        expect(seen!.init.method).toBe('POST');
        expect((seen!.init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
        expect(JSON.parse(seen!.init.body as string)).toEqual(sub);
    });

    it('asks for a board with limit and player in the query', async () => {
        let url = '';
        const c = clientWith((async (u: string) => { url = u; return jsonRes({ key: 'k', total: 0, entries: [] }); }) as unknown as typeof fetch);
        await c.board('k'.repeat(32), { limit: 10, playerId: 'p'.repeat(32) });
        expect(url).toBe(`https://lb.test/boards/${'k'.repeat(32)}?limit=10&player=${'p'.repeat(32)}`);
        await c.board('k'.repeat(32));
        expect(url).toBe(`https://lb.test/boards/${'k'.repeat(32)}`);
    });

    it('classifies failures, and says which are worth retrying', async () => {
        const cases: [Response | Error, string, boolean][] = [
            [new TypeError('Failed to fetch'), 'network', true],
            [jsonRes({}, 429), 'rate', true],
            [jsonRes({}, 503), 'server', true],
            [jsonRes({ error: 'invalid', message: 'score must be a whole number' }, 400), 'rejected', false],
            [new Response('<html>', { status: 200 }), 'schema', false],
            [jsonRes({ nope: true }), 'schema', false],
        ];
        for (const [outcome, kind, retryable] of cases) {
            const c = clientWith((async () => { if (outcome instanceof Error) throw outcome; return outcome.clone(); }) as unknown as typeof fetch);
            const e = await failure(c.submit(sub));
            expect([e.kind, e.retryable], String(kind)).toEqual([kind, retryable]);
        }
        const c = clientWith((async () => jsonRes({ error: 'invalid', message: 'score must be a whole number' }, 400)) as unknown as typeof fetch);
        expect((await failure(c.submit(sub))).message).toBe('score must be a whole number');
    });

    it('times out slow servers', async () => {
        const hang = ((_u: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('x', 'AbortError'))))) as unknown as typeof fetch;
        const e = await failure(clientWith(hang, 20).board('k'.repeat(32)));
        expect(e).toMatchObject({ kind: 'timeout', retryable: true });
    });

    it('stops when the caller aborts', async () => {
        const hang = ((_u: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('x', 'AbortError'))))) as unknown as typeof fetch;
        const ctl = new AbortController();
        const p = clientWith(hang).board('k'.repeat(32), { signal: ctl.signal });
        ctl.abort();
        expect((await failure(p)).kind).toBe('aborted');
        const already = new AbortController(); already.abort();
        expect((await failure(clientWith(hang).board('k'.repeat(32), { signal: already.signal }))).kind).toBe('aborted');
    });
});
