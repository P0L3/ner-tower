import {
    BOARD_MAX_LIMIT, MAX_BODY_BYTES, isBoardKey, isPlayerId, parseLimit, parseSubmission,
    type BoardEntry, type BoardResponse, type SubmitResponse,
} from '../../src/leaderboard/protocol';

/**
 * The leaderboard API as a plain `Request -> Response` function over a D1-shaped database, so it
 * runs unchanged in the Worker and in unit tests (against real SQLite). No Cloudflare imports.
 *
 *   POST /scores          { boardKey, playerId, nickname, score }  -> SubmitResponse
 *   GET  /boards/:key     ?limit=20&player=<playerId>              -> BoardResponse
 *   GET  /health
 */

/** The slice of D1 this code uses (`D1Database` satisfies it). */
export interface D1PreparedLike {
    bind(...values: unknown[]): D1PreparedLike;
    all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}
export interface D1Like {
    prepare(sql: string): D1PreparedLike;
    batch<T = Record<string, unknown>>(statements: D1PreparedLike[]): Promise<{ results: T[] }[]>;
}
/** Workers Rate Limiting binding. */
export interface RateLimiterLike { limit(options: { key: string }): Promise<{ success: boolean }> }

export interface Env {
    DB: D1Like;
    /** Optional: without it (local dev) there is no rate limiting. */
    RATE_LIMITER?: RateLimiterLike;
}

// `*` also covers the opaque "null" origin of a page opened from disk. No cookies are involved.
const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
} as const;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS, ...headers } });
const fail = (status: number, error: string, message: string, headers?: Record<string, string>) => json({ error, message }, status, headers);

/** Rows ranked strictly ahead of a given row. Order: higher score, then earlier, then player id (a total order). */
const AHEAD = '(score > ?2 OR (score = ?2 AND (created_at < ?3 OR (created_at = ?3 AND player_id < ?4))))';

export async function handleRequest(request: Request, env: Env, now: number = Date.now()): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    try {
        if (url.pathname === '/health') return json({ ok: true });
        if (url.pathname === '/scores') {
            return request.method === 'POST' ? await postScore(request, env, now) : fail(405, 'method_not_allowed', 'Use POST.', { Allow: 'POST, OPTIONS' });
        }
        const board = /^\/boards\/([^/]+)$/.exec(url.pathname);
        if (board) {
            return request.method === 'GET' ? await getBoard(board[1], url, env) : fail(405, 'method_not_allowed', 'Use GET.', { Allow: 'GET, OPTIONS' });
        }
        return fail(404, 'not_found', 'No such route.');
    } catch (e) {
        console.error('leaderboard error', e);
        return fail(500, 'server_error', 'Something went wrong. Try again later.');
    }
}

async function postScore(request: Request, env: Env, now: number): Promise<Response> {
    if (env.RATE_LIMITER) {
        const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
        const { success } = await env.RATE_LIMITER.limit({ key: `post:${ip}` });
        if (!success) return fail(429, 'rate_limited', 'Too many submissions. Try again in a minute.', { 'Retry-After': '60' });
    }
    const declared = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return fail(413, 'too_large', 'Request body too large.');
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return fail(413, 'too_large', 'Request body too large.');

    let body: unknown;
    try { body = JSON.parse(text); } catch { return fail(400, 'invalid', 'Body must be JSON.'); }
    const parsed = parseSubmission(body);
    if (!parsed.ok) return fail(400, 'invalid', parsed.message);
    const { boardKey, playerId, nickname, score } = parsed.value;

    // Keep the best score per (board, player). The nickname always follows the latest submission.
    // Everything on the right of SET sees the OLD row, so `created_at` only moves when the score improves.
    const upsert = await env.DB.prepare(
        `INSERT INTO scores (board_key, player_id, nickname, score, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (board_key, player_id) DO UPDATE SET
             nickname = excluded.nickname,
             created_at = CASE WHEN excluded.score > scores.score THEN excluded.created_at ELSE scores.created_at END,
             score = MAX(scores.score, excluded.score)
         RETURNING score, created_at`,
    ).bind(boardKey, playerId, nickname, score, now).all<{ score: number; created_at: number }>();
    const mine = upsert.results[0];

    const stats = await env.DB.prepare(
        `SELECT (SELECT COUNT(*) FROM scores WHERE board_key = ?1) AS total,
                (SELECT COUNT(*) + 1 FROM scores WHERE board_key = ?1 AND ${AHEAD}) AS rank`,
    ).bind(boardKey, mine.score, mine.created_at, playerId).all<{ total: number; rank: number }>();

    const response: SubmitResponse = { best: mine.score, improved: mine.created_at === now, rank: stats.results[0].rank, total: stats.results[0].total };
    return json(response);
}

async function getBoard(key: string, url: URL, env: Env): Promise<Response> {
    if (!isBoardKey(key)) return fail(400, 'invalid', 'Board keys are 32 lowercase hex characters.');
    const limit = parseLimit(url.searchParams.get('limit'));
    const player = url.searchParams.get('player');
    if (player !== null && !isPlayerId(player)) return fail(400, 'invalid', 'player must be 32 lowercase hex characters.');

    const statements = [
        env.DB.prepare('SELECT nickname, score FROM scores WHERE board_key = ?1 ORDER BY score DESC, created_at ASC, player_id ASC LIMIT ?2').bind(key, Math.min(limit, BOARD_MAX_LIMIT)),
        env.DB.prepare('SELECT COUNT(*) AS total FROM scores WHERE board_key = ?1').bind(key),
    ];
    if (player !== null) {
        // Exact rank however far down: count the rows ranked ahead of this player's row.
        statements.push(env.DB.prepare(
            `SELECT nickname, score,
                    (SELECT COUNT(*) + 1 FROM scores WHERE board_key = ?1
                       AND (score > s.score OR (score = s.score AND (created_at < s.created_at OR (created_at = s.created_at AND player_id < s.player_id))))) AS rank
             FROM scores s WHERE board_key = ?1 AND player_id = ?2`,
        ).bind(key, player));
    }
    const [top, count, me] = await env.DB.batch(statements);

    const entries: BoardEntry[] = (top.results as { nickname: string; score: number }[]).map((r, i) => ({ rank: i + 1, nickname: r.nickname, score: r.score }));
    const response: BoardResponse = { key, total: (count.results[0] as { total: number }).total, entries };
    const row = me?.results[0] as { nickname: string; score: number; rank: number } | undefined;
    if (row) response.you = { rank: row.rank, nickname: row.nickname, score: row.score };
    return json(response);
}
