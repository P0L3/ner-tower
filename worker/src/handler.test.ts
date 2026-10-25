import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleRequest, type Env, type RateLimiterLike } from './handler';
import { createTestDb } from './d1.testutil';
import { MAX_SCORE } from '../../src/leaderboard/protocol';
import type { BoardResponse, SubmitResponse } from '../../src/leaderboard/protocol';

const KEY = 'a'.repeat(32);
const OTHER_KEY = 'b'.repeat(32);
const pid = (n: number) => n.toString(16).padStart(32, '0');

let env: Env;
let clock = 1_000_000;
beforeEach(async () => { env = { DB: await createTestDb() }; clock = 1_000_000; });

const post = (body: unknown, init: RequestInit = {}, e: Env = env, now = ++clock) =>
    handleRequest(new Request('https://x.test/scores', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), ...init }), e, now);
const submit = async (n: number, score: number, over: Record<string, unknown> = {}, now?: number) =>
    (await (await post({ boardKey: KEY, playerId: pid(n), nickname: `P${n}`, score, ...over }, {}, env, now)).json()) as SubmitResponse;
const get = (path: string, e: Env = env) => handleRequest(new Request('https://x.test' + path), e);
const board = async (path: string) => (await (await get(path)).json()) as BoardResponse;

describe('POST /scores', () => {
    it('stores a first score and reports rank 1 of 1', async () => {
        const res = await post({ boardKey: KEY, playerId: pid(1), nickname: 'Ada', score: 120 });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ best: 120, improved: true, rank: 1, total: 1 });
    });

    it('keeps the best score per player: lower and equal scores change nothing, higher ones replace', async () => {
        await submit(1, 100);
        expect(await submit(1, 40)).toMatchObject({ best: 100, improved: false });
        expect(await submit(1, 100)).toMatchObject({ best: 100, improved: false });
        expect(await submit(1, 250)).toMatchObject({ best: 250, improved: true });
        expect((await board(`/boards/${KEY}`)).entries).toEqual([{ rank: 1, nickname: 'P1', score: 250 }]);
    });

    it('one row per player: the nickname follows the latest submission, even when the score does not improve', async () => {
        await submit(1, 100, { nickname: 'Old' });
        await submit(1, 10, { nickname: 'New' });
        const b = await board(`/boards/${KEY}`);
        expect(b.total).toBe(1);
        expect(b.entries[0]).toMatchObject({ nickname: 'New', score: 100 });
    });

    it('ranks higher scores first, and the earlier achiever first on a tie', async () => {
        await submit(1, 100, {}, 5000);
        await submit(2, 100, {}, 6000);   // same score, later
        await submit(3, 300, {}, 7000);
        const b = await board(`/boards/${KEY}`);
        expect(b.entries.map(e => [e.rank, e.nickname])).toEqual([[1, 'P3'], [2, 'P1'], [3, 'P2']]);
        expect(await submit(2, 100, {}, 9000)).toMatchObject({ rank: 3, improved: false }); // a repeat does not jump the queue
        expect(await submit(1, 100, {}, 9001)).toMatchObject({ rank: 2 });
    });

    it('the tie-break moves to the time of the improvement, not the first attempt', async () => {
        await submit(1, 100, {}, 1000);
        await submit(2, 100, {}, 2000);
        await submit(1, 200, {}, 3000);
        await submit(2, 200, {}, 4000);
        expect((await board(`/boards/${KEY}`)).entries.map(e => e.nickname)).toEqual(['P1', 'P2']);
    });

    it('keeps boards separate', async () => {
        await submit(1, 100);
        await submit(1, 999, { boardKey: OTHER_KEY });
        expect((await board(`/boards/${KEY}`)).entries.map(e => e.score)).toEqual([100]);
        expect((await board(`/boards/${OTHER_KEY}`)).entries.map(e => e.score)).toEqual([999]);
    });

    it('rejects malformed submissions with 400 and a reason', async () => {
        const ok = { boardKey: KEY, playerId: pid(1), nickname: 'Ada', score: 10 };
        const bad: Record<string, unknown>[] = [
            { ...ok, boardKey: 'nope' }, { ...ok, boardKey: KEY.toUpperCase() }, { ...ok, playerId: 'x' },
            { ...ok, nickname: '' }, { ...ok, nickname: '   ' }, { ...ok, nickname: 'x'.repeat(21) }, { ...ok, nickname: 'a\u0007b' }, { ...ok, nickname: 'a\u202eb' }, { ...ok, nickname: 5 },
            { ...ok, score: 0 }, { ...ok, score: -3 }, { ...ok, score: 1.5 }, { ...ok, score: '10' }, { ...ok, score: MAX_SCORE + 1 }, { ...ok, score: null },
        ];
        for (const body of bad) {
            const res = await post(body);
            expect(res.status, JSON.stringify(body)).toBe(400);
            expect(await res.json()).toMatchObject({ error: 'invalid', message: expect.any(String) });
        }
        expect((await post(JSON.stringify([ok]))).status).toBe(400);
        expect((await post('not json')).status).toBe(400);
        expect((await board(`/boards/${KEY}`)).total).toBe(0);
    });

    it('accepts the extremes: highest possible score, 20 character and non-ASCII nicknames', async () => {
        expect((await post({ boardKey: KEY, playerId: pid(1), nickname: 'x'.repeat(20), score: MAX_SCORE })).status).toBe(200);
        expect((await post({ boardKey: KEY, playerId: pid(2), nickname: '\u{1F600}'.repeat(20), score: 1 })).status).toBe(200);
        expect((await post({ boardKey: KEY, playerId: pid(3), nickname: '  Zo\u00eb   Smith ', score: 1 })).status).toBe(200);
        expect((await post({ boardKey: KEY, playerId: pid(4), nickname: 'two\nlines', score: 1 })).status).toBe(200); // whitespace collapses
        const names = (await board(`/boards/${KEY}?limit=100`)).entries.map(e => e.nickname);
        expect(names).toContain('Zo\u00eb Smith');
        expect(names).toContain('two lines');
    });

    it('rejects oversized bodies, by declared length and by actual length', async () => {
        const big = JSON.stringify({ boardKey: KEY, playerId: pid(1), nickname: 'a', score: 1, pad: 'x'.repeat(5000) });
        expect((await post(big)).status).toBe(413);
        expect((await post('{}', { headers: { 'Content-Length': '99999' } })).status).toBe(413);
    });

    it('rate limits per IP: 429 with Retry-After, and a different IP is unaffected', async () => {
        const seen: string[] = [];
        const counts = new Map<string, number>();
        const limiter: RateLimiterLike = { limit: async ({ key }) => { seen.push(key); const n = (counts.get(key) ?? 0) + 1; counts.set(key, n); return { success: n <= 2 }; } };
        const limited: Env = { ...env, RATE_LIMITER: limiter };
        const body = { boardKey: KEY, playerId: pid(1), nickname: 'A', score: 5 };
        const from = (ip: string) => post(body, { headers: { 'CF-Connecting-IP': ip } }, limited);
        expect((await from('1.1.1.1')).status).toBe(200);
        expect((await from('1.1.1.1')).status).toBe(200);
        const blocked = await from('1.1.1.1');
        expect(blocked.status).toBe(429);
        expect(blocked.headers.get('Retry-After')).toBe('60');
        expect(blocked.headers.get('Access-Control-Allow-Origin')).toBe('*');
        expect((await from('2.2.2.2')).status).toBe(200);
        expect(seen[0]).toBe('post:1.1.1.1');
        expect((await board(`/boards/${KEY}`)).total).toBe(1); // the blocked request wrote nothing
    });
});

describe('GET /boards/:key', () => {
    it('returns an empty board', async () => {
        expect(await board(`/boards/${KEY}`)).toEqual({ key: KEY, total: 0, entries: [] });
    });

    it('limits the list, clamps the limit, and falls back to the default for junk', async () => {
        for (let i = 1; i <= 130; i++) await submit(i, i);
        expect((await board(`/boards/${KEY}?limit=5`)).entries).toHaveLength(5);
        expect((await board(`/boards/${KEY}?limit=1000`)).entries).toHaveLength(100);
        expect((await board(`/boards/${KEY}?limit=0`)).entries).toHaveLength(1);
        expect((await board(`/boards/${KEY}?limit=abc`)).entries).toHaveLength(20);
        expect((await board(`/boards/${KEY}`)).entries).toHaveLength(20);
        const b = await board(`/boards/${KEY}?limit=3`);
        expect(b.total).toBe(130);
        expect(b.entries.map(e => [e.rank, e.score])).toEqual([[1, 130], [2, 129], [3, 128]]);
    });

    it('gives the exact rank of a player far outside the top N, and none to players without a score', async () => {
        for (let i = 1; i <= 60; i++) await submit(i, i * 10);  // player 60 is first, player 1 is last
        const mid = await board(`/boards/${KEY}?limit=5&player=${pid(44)}`);   // 44*10 -> 16 players ahead
        expect(mid.entries).toHaveLength(5);
        expect(mid.you).toEqual({ rank: 17, nickname: 'P44', score: 440 });
        expect((await board(`/boards/${KEY}?limit=5&player=${pid(1)}`)).you).toMatchObject({ rank: 60, score: 10 });
        expect((await board(`/boards/${KEY}?limit=5&player=${pid(60)}`)).you).toMatchObject({ rank: 1 });
        expect((await board(`/boards/${KEY}?player=${pid(999)}`)).you).toBeUndefined();
        expect((await board(`/boards/${KEY}`)).you).toBeUndefined();
    });

    it('the rank in a listing, in "you", and in the submit answer always agree, ties included', async () => {
        const scores = [50, 70, 70, 70, 20, 90, 70, 50];
        for (let i = 0; i < scores.length; i++) await submit(i + 1, scores[i], {}, 10_000 + (i % 3) * 1000 + i); // plenty of equal times and scores
        const full = await board(`/boards/${KEY}?limit=100`);
        for (let i = 0; i < scores.length; i++) {
            const you = (await board(`/boards/${KEY}?limit=1&player=${pid(i + 1)}`)).you!;
            const listed = full.entries.find(e => e.nickname === `P${i + 1}`)!;
            expect(you.rank).toBe(listed.rank);
        }
        expect(full.entries.map(e => e.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('never reveals player ids', async () => {
        await submit(7, 10);
        const text = await (await get(`/boards/${KEY}?player=${pid(7)}`)).text();
        expect(text).not.toContain(pid(7));
    });

    it('rejects bad keys and player ids', async () => {
        expect((await get('/boards/short')).status).toBe(400);
        expect((await get(`/boards/${KEY}?player=me`)).status).toBe(400);
    });
});

describe('routing, CORS and failures', () => {
    it('answers preflight requests for any origin, including the "null" origin of a local file', async () => {
        const res = await handleRequest(new Request('https://x.test/scores', { method: 'OPTIONS', headers: { Origin: 'null', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } }), env);
        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
        expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
        expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('puts CORS and no-store on every kind of answer', async () => {
        for (const res of [await get('/health'), await get('/nope'), await get('/boards/x'), await post('bad')]) {
            expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
            expect(res.headers.get('Cache-Control')).toBe('no-store');
            expect(res.headers.get('Content-Type')).toContain('application/json');
        }
    });

    it('404 for unknown routes, 405 for the wrong method', async () => {
        expect((await get('/nope')).status).toBe(404);
        expect((await get('/scores')).status).toBe(405);
        expect((await handleRequest(new Request(`https://x.test/boards/${KEY}`, { method: 'POST', body: '{}' }), env)).status).toBe(405);
    });

    it('turns a database failure into a clean 500 (with CORS), without leaking details', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const broken: Env = { DB: { prepare: () => { throw new Error('secret db detail'); }, batch: async () => { throw new Error('x'); } } };
        const res = await post({ boardKey: KEY, playerId: pid(1), nickname: 'A', score: 5 }, {}, broken);
        expect(res.status).toBe(500);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
        expect(await res.text()).not.toContain('secret');
    });
});

describe('schema', () => {
    it('serves ranking from the index alone (no table scan, no temp sort)', async () => {
        const db = await createTestDb();
        const plan = db.exec(`EXPLAIN QUERY PLAN SELECT nickname, score FROM scores WHERE board_key = 'k' ORDER BY score DESC, created_at ASC, player_id ASC LIMIT 20`)
            .map(r => String(r.detail)).join(' | ');
        expect(plan).not.toMatch(/TEMP B-TREE/);
        expect(plan).toMatch(/INDEX scores_rank|PRIMARY KEY/);
    });
});
