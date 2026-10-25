import { HEIGHT_UNIT_PX, PHYSICS } from '../config/ruleset';

/**
 * The wire format shared by the game and the leaderboard Worker (worker/). Pure TypeScript, no
 * DOM and no Worker APIs, so both sides import the same validation and cannot drift apart.
 */

/** Highest score the world can physically produce (top of the world, in meters). Anything above is rejected. */
export const MAX_SCORE = Math.floor((PHYSICS.playerStartY - PHYSICS.worldTop) / HEIGHT_UNIT_PX);
export const NICKNAME_MAX = 20;
export const BOARD_DEFAULT_LIMIT = 20;
export const BOARD_MAX_LIMIT = 100;
export const MAX_BODY_BYTES = 2048;

export const isBoardKey = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);
/** Random identifier the game makes once per browser. It is a bearer secret: it is never listed by the server. */
export const isPlayerId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);

/**
 * Nickname rules: 1..NICKNAME_MAX characters (code points) after trimming and collapsing runs of
 * whitespace; no control characters. Returns the cleaned name, or undefined if it is not acceptable.
 */
export function normalizeNickname(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined;
    const name = raw.replace(/\s+/g, ' ').trim();
    const length = Array.from(name).length;
    if (length < 1 || length > NICKNAME_MAX) return undefined;
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200b-\u200f\u202a-\u202e\u2066-\u2069]/.test(name)) return undefined;
    return name;
}

export interface ScoreSubmission { boardKey: string; playerId: string; nickname: string; score: number }

export interface SubmitResponse {
    /** The player's best score on this board after this submission. */
    best: number;
    /** True if this submission set a new best. */
    improved: boolean;
    /** Exact rank of the best score, 1 = first. */
    rank: number;
    total: number;
}

export interface BoardEntry { rank: number; nickname: string; score: number }

export interface BoardResponse {
    key: string;
    /** Number of players with a score on this board. */
    total: number;
    /** The top entries, best first. */
    entries: BoardEntry[];
    /** Present when a `player` was asked for and has a score: the exact rank, however far down. */
    you?: BoardEntry;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

export function parseSubmission(json: unknown): Parsed<ScoreSubmission> {
    if (json === null || typeof json !== 'object' || Array.isArray(json)) return { ok: false, message: 'Body must be a JSON object.' };
    const o = json as Record<string, unknown>;
    if (!isBoardKey(o.boardKey)) return { ok: false, message: 'boardKey must be 32 lowercase hex characters.' };
    if (!isPlayerId(o.playerId)) return { ok: false, message: 'playerId must be 32 lowercase hex characters.' };
    const nickname = normalizeNickname(o.nickname);
    if (nickname === undefined) return { ok: false, message: `nickname must be 1 to ${NICKNAME_MAX} printable characters.` };
    if (typeof o.score !== 'number' || !Number.isInteger(o.score) || o.score < 1 || o.score > MAX_SCORE) {
        return { ok: false, message: `score must be a whole number from 1 to ${MAX_SCORE}.` };
    }
    return { ok: true, value: { boardKey: o.boardKey, playerId: o.playerId, nickname, score: o.score } };
}

/** `?limit=` clamped to 1..BOARD_MAX_LIMIT; anything unusable falls back to the default. */
export function parseLimit(raw: string | null): number {
    if (raw === null || !/^\d{1,4}$/.test(raw)) return BOARD_DEFAULT_LIMIT;
    return Math.min(Math.max(Number(raw), 1), BOARD_MAX_LIMIT);
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isEntry = (v: unknown): v is BoardEntry =>
    isObj(v) && Number.isInteger(v.rank) && typeof v.nickname === 'string' && Number.isInteger(v.score);

/** Client-side check of a server answer. */
export function parseBoardResponse(json: unknown): Parsed<BoardResponse> {
    if (!isObj(json) || typeof json.key !== 'string' || !Number.isInteger(json.total) || !Array.isArray(json.entries) || !json.entries.every(isEntry)) {
        return { ok: false, message: 'Unexpected leaderboard response.' };
    }
    if (json.you !== undefined && !isEntry(json.you)) return { ok: false, message: 'Unexpected leaderboard response.' };
    return { ok: true, value: json as unknown as BoardResponse };
}

export function parseSubmitResponse(json: unknown): Parsed<SubmitResponse> {
    if (!isObj(json) || !Number.isInteger(json.best) || typeof json.improved !== 'boolean' || !Number.isInteger(json.rank) || !Number.isInteger(json.total)) {
        return { ok: false, message: 'Unexpected leaderboard response.' };
    }
    return { ok: true, value: json as unknown as SubmitResponse };
}
