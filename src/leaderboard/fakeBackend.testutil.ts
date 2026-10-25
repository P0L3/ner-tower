import { Leaderboard } from './service';
import { LeaderboardClient } from './client';
import { Outbox } from './outbox';
import { PlayerStore, type SyncStorage } from './player';
import { handleRequest, type Env } from '../../worker/src/handler';
import { createTestDb } from '../../worker/src/d1.testutil';

/** A whole leaderboard backend for UI tests: the real Worker handler on real SQLite, with a switchable outage. */
export async function createBackend() {
    const env: Env = { DB: await createTestDb() };
    const state = { down: false, now: 1_000, requests: [] as string[] };
    const fetchImpl = (async (url: string, init?: RequestInit) => {
        state.requests.push(`${init?.method ?? 'GET'} ${url.replace('https://lb.test', '')}`);
        if (state.down) throw new TypeError('Failed to fetch');
        return handleRequest(new Request(url, init), env, state.now++);
    }) as unknown as typeof fetch;

    const newLeaderboard = (nickname?: string): Leaderboard => {
        const m = new Map<string, string>();
        const storage: SyncStorage = { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
        const player = new PlayerStore(storage);
        if (nickname) player.setNickname(nickname);
        return new Leaderboard(new LeaderboardClient('https://lb.test', { fetch: fetchImpl }), player, new Outbox(storage));
    };
    return { state, newLeaderboard, posts: () => state.requests.filter(r => r.startsWith('POST')) };
}
