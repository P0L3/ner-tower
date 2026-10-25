import { describe, it, expect, beforeEach } from 'vitest';
import { Leaderboard } from './service';
import { LeaderboardClient } from './client';
import { Outbox } from './outbox';
import { PlayerStore, type SyncStorage } from './player';
import { handleRequest, type Env } from '../../worker/src/handler';
import { createTestDb } from '../../worker/src/d1.testutil';

/** The real client against the real Worker handler and real SQLite, with switchable outages. */
const KEY = 'c'.repeat(32);
const KEY2 = 'd'.repeat(32);
const mem = (): SyncStorage => { const m = new Map<string, string>(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } }; };

let env: Env;
let down = false;
let requests: string[];
let nowMs = 1_000;
const fakeFetch = (async (url: string, init?: RequestInit) => {
    requests.push(`${init?.method ?? 'GET'} ${url.replace('https://lb.test', '')}`);
    if (down) throw new TypeError('Failed to fetch');
    return handleRequest(new Request(url, init), env, nowMs++);
}) as unknown as typeof fetch;

function newPlayer(nickname?: string) {
    const storage = mem();
    const player = new PlayerStore(storage);
    if (nickname) player.setNickname(nickname);
    return new Leaderboard(new LeaderboardClient('https://lb.test', { fetch: fakeFetch }), player, new Outbox(storage));
}

beforeEach(async () => { env = { DB: await createTestDb() }; down = false; requests = []; nowMs = 1_000; });

describe('Leaderboard.submitRun', () => {
    it('sends a score and reports the exact rank', async () => {
        const ada = newPlayer('Ada'), bob = newPlayer('Bob');
        expect(await ada.submitRun(KEY, 100)).toMatchObject({ status: 'sent', response: { best: 100, rank: 1, total: 1 } });
        expect(await bob.submitRun(KEY, 50)).toMatchObject({ status: 'sent', response: { rank: 2, total: 2 } });
        expect(ada.outbox.list()).toEqual([]);
        const board = await bob.client.board(KEY, { playerId: bob.player.id, limit: 1 });
        expect(board.entries).toEqual([{ rank: 1, nickname: 'Ada', score: 100 }]);
        expect(board.you).toEqual({ rank: 2, nickname: 'Bob', score: 50 });
    });

    it('does not submit a score of zero', async () => {
        const ada = newPlayer('Ada');
        expect(await ada.submitRun(KEY, 0)).toEqual({ status: 'skipped' });
        expect(requests).toEqual([]);
    });

    it('holds the score until there is a nickname, then sends it', async () => {
        const ada = newPlayer();
        expect(await ada.submitRun(KEY, 80)).toEqual({ status: 'needs-nickname' });
        expect(requests).toEqual([]);
        expect(ada.outbox.list()).toEqual([{ boardKey: KEY, score: 80 }]);
        ada.player.setNickname('Ada');
        expect(await ada.submitRun(KEY, 80)).toMatchObject({ status: 'sent', response: { best: 80 } });
        expect(requests).toHaveLength(1);
    });

    it('queues during an outage without throwing, and delivers on the next try', async () => {
        const ada = newPlayer('Ada');
        down = true;
        expect(await ada.submitRun(KEY, 60)).toMatchObject({ status: 'queued', reason: expect.stringContaining('reach') });
        expect(ada.outbox.list()).toEqual([{ boardKey: KEY, score: 60 }]);
        down = false;
        const flushed = await ada.flush();
        expect(flushed.sent.get(KEY)).toMatchObject({ best: 60 });
        expect(flushed.blocked).toBeUndefined();
        expect(ada.outbox.list()).toEqual([]);
    });

    it('a later run sends the earlier queued scores too, and keeps only the best per board', async () => {
        const ada = newPlayer('Ada');
        down = true;
        await ada.submitRun(KEY, 60); await ada.submitRun(KEY, 90); await ada.submitRun(KEY2, 30);
        down = false;
        expect(await ada.submitRun(KEY, 20)).toMatchObject({ status: 'sent', response: { best: 90 } });
        expect(ada.outbox.list()).toEqual([]);
        expect((await ada.client.board(KEY2, { playerId: ada.player.id })).you).toMatchObject({ score: 30 });
    });

    it('drops a score the server refuses for good, and keeps going with the rest', async () => {
        const ada = newPlayer('Ada');
        ada.outbox.add('e'.repeat(32), 99_999);     // impossible score: 400
        ada.outbox.add(KEY, 10);
        const flushed = await ada.flush();
        expect(flushed.dropped.get('e'.repeat(32))).toMatch(/score/);
        expect(flushed.sent.get(KEY)).toBeDefined();
        expect(ada.outbox.list()).toEqual([]);
        expect(await ada.submitRun('e'.repeat(32), 99_999)).toMatchObject({ status: 'rejected', reason: expect.stringContaining('score') });
    });

    it('stops at the first retryable failure instead of hammering a struggling server', async () => {
        const ada = newPlayer('Ada');
        let n = 0;
        const flaky = (async (u: string, i?: RequestInit) => { if (n++ === 1) return new Response('{}', { status: 503 }); return fakeFetch(u, i); }) as unknown as typeof fetch;
        const lb = new Leaderboard(new LeaderboardClient('https://lb.test', { fetch: flaky }), ada.player, ada.outbox);
        for (const k of ['1', '2', '3']) lb.outbox.add(k.repeat(32), 5);
        const flushed = await lb.flush();
        expect(flushed.sent.size).toBe(1);
        expect(flushed.blocked).toMatchObject({ kind: 'server' });
        expect(lb.outbox.list()).toHaveLength(2);
    });

    it('serializes flushes, so concurrent game-over and menu flushes never double-send', async () => {
        const ada = newPlayer('Ada');
        ada.outbox.add(KEY, 40);
        const [a, b] = await Promise.all([ada.flush(), ada.flush()]);
        expect(a.sent.size + b.sent.size).toBe(1);
        expect(requests.filter(r => r.startsWith('POST'))).toHaveLength(1);
    });

    it('uses the current nickname, so renaming shows on the next submission', async () => {
        const ada = newPlayer('Ada');
        await ada.submitRun(KEY, 10);
        ada.player.setNickname('Ada II');
        await ada.submitRun(KEY, 5);
        expect((await ada.client.board(KEY)).entries[0]).toMatchObject({ nickname: 'Ada II', score: 10 });
    });
});
