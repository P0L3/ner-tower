import {
    parseBoardResponse, parseSubmitResponse,
    type BoardResponse, type Parsed, type ScoreSubmission, type SubmitResponse,
} from './protocol';

export type LeaderboardErrorKind = 'network' | 'timeout' | 'rate' | 'server' | 'rejected' | 'schema' | 'aborted';

/** `message` is safe to show. `retryable`: the same request may well work later (offline, busy, down). */
export class LeaderboardError extends Error {
    readonly kind: LeaderboardErrorKind;
    readonly status: number | undefined;
    constructor(kind: LeaderboardErrorKind, message: string, status?: number) {
        super(message);
        this.name = 'LeaderboardError';
        this.kind = kind;
        this.status = status;
    }
    get retryable(): boolean { return this.kind === 'network' || this.kind === 'timeout' || this.kind === 'rate' || this.kind === 'server'; }
}

export interface ClientOptions {
    fetch?: typeof fetch;
    timeoutMs?: number;
}

export interface BoardQuery { limit?: number; playerId?: string; signal?: AbortSignal }

export class LeaderboardClient {
    private readonly baseUrl: string;
    private readonly doFetch: typeof fetch;
    private readonly timeoutMs: number;

    constructor(baseUrl: string, options: ClientOptions = {}) {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.doFetch = options.fetch ?? ((...a) => fetch(...a));
        this.timeoutMs = options.timeoutMs ?? 8000;
    }

    submit(s: ScoreSubmission, signal?: AbortSignal): Promise<SubmitResponse> {
        return this.request('/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }, parseSubmitResponse, signal);
    }

    board(key: string, q: BoardQuery = {}): Promise<BoardResponse> {
        const params = new URLSearchParams();
        if (q.limit !== undefined) params.set('limit', String(q.limit));
        if (q.playerId !== undefined) params.set('player', q.playerId);
        const qs = params.toString();
        return this.request(`/boards/${encodeURIComponent(key)}${qs ? '?' + qs : ''}`, { method: 'GET' }, parseBoardResponse, q.signal);
    }

    private async request<T>(path: string, init: RequestInit, parse: (json: unknown) => Parsed<T>, outer?: AbortSignal): Promise<T> {
        const ctl = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, this.timeoutMs);
        const onOuterAbort = () => ctl.abort();
        outer?.addEventListener('abort', onOuterAbort);
        try {
            if (outer?.aborted) throw new LeaderboardError('aborted', 'Cancelled.');
            let res: Response;
            try {
                res = await this.doFetch(this.baseUrl + path, { ...init, signal: ctl.signal });
            } catch {
                if (timedOut) throw new LeaderboardError('timeout', 'The leaderboard took too long to answer.');
                if (outer?.aborted) throw new LeaderboardError('aborted', 'Cancelled.');
                throw new LeaderboardError('network', 'Could not reach the leaderboard.');
            }
            if (res.status === 429) throw new LeaderboardError('rate', 'Too many requests. Try again in a minute.', 429);
            if (res.status >= 500) throw new LeaderboardError('server', 'The leaderboard is having trouble. Try again later.', res.status);
            let body: unknown;
            try { body = await res.json(); } catch { body = undefined; }
            if (!res.ok) {
                const message = typeof (body as { message?: unknown } | undefined)?.message === 'string' ? (body as { message: string }).message : 'The leaderboard rejected the request.';
                throw new LeaderboardError('rejected', message, res.status);
            }
            const parsed = parse(body);
            if (!parsed.ok) throw new LeaderboardError('schema', parsed.message);
            return parsed.value;
        } finally {
            clearTimeout(timer);
            outer?.removeEventListener('abort', onOuterAbort);
        }
    }
}
