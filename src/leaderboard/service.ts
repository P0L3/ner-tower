import { LeaderboardClient, LeaderboardError } from './client';
import { Outbox } from './outbox';
import { BestScores } from './bests';
import { PlayerStore } from './player';
import type { SubmitResponse } from './protocol';

export interface FlushResult {
    /** Boards whose pending score reached the server, with its answer. */
    sent: Map<string, SubmitResponse>;
    /** Boards whose score the server refused for good (removed from the outbox). */
    dropped: Map<string, string>;
    /** Why sending stopped early (offline, busy), or 'no-nickname'. Undefined if everything was sent. */
    blocked?: LeaderboardError | 'no-nickname';
}

export type RunOutcome =
    | { status: 'skipped' }                                  // nothing to submit (score 0)
    | { status: 'not-better'; best: number }                 // not above the best already known for this board: nothing is sent
    | { status: 'needs-nickname' }                           // saved; will be sent once a nickname exists
    | { status: 'sent'; response: SubmitResponse }
    | { status: 'queued'; reason: string }                   // saved; will be retried
    | { status: 'rejected'; reason: string };

/**
 * Submitting scores without ever blocking or losing them: every score goes into the outbox first,
 * then the outbox is flushed. A failure just leaves it queued for the next flush.
 * Only personal bests are sent: a run that does not beat the best this browser knows for the board
 * would change nothing on the server, so it is not sent at all.
 */
export class Leaderboard {
    readonly client: LeaderboardClient;
    readonly player: PlayerStore;
    readonly outbox: Outbox;
    readonly bests: BestScores;
    /** Set when the player skipped the nickname prompt; the game stops asking until the page is reloaded. */
    promptDeclined = false;
    private chain: Promise<unknown> = Promise.resolve();

    constructor(client: LeaderboardClient, player: PlayerStore, outbox: Outbox, bests?: BestScores) {
        this.client = client;
        this.player = player;
        this.outbox = outbox;
        const memory = new Map<string, string>();
        this.bests = bests ?? new BestScores({ getItem: k => memory.get(k) ?? null, setItem: (k, v) => { memory.set(k, v); } });
    }

    /** Sends everything pending. Calls queue up, so two flushes never run at once. Never throws. */
    flush(): Promise<FlushResult> {
        const run = this.chain.then(() => this.doFlush());
        this.chain = run.catch(() => undefined);
        return run;
    }

    private async doFlush(): Promise<FlushResult> {
        const result: FlushResult = { sent: new Map(), dropped: new Map() };
        const nickname = this.player.nickname;
        if (nickname === undefined) { if (this.outbox.list().length > 0) result.blocked = 'no-nickname'; return result; }
        for (const pending of this.outbox.list()) {
            try {
                const response = await this.client.submit({ boardKey: pending.boardKey, playerId: this.player.id, nickname, score: pending.score });
                this.outbox.remove(pending.boardKey, pending.score);
                this.bests.record(pending.boardKey, response.best);
                result.sent.set(pending.boardKey, response);
            } catch (e) {
                const err = e instanceof LeaderboardError ? e : new LeaderboardError('network', 'Could not reach the leaderboard.');
                if (err.retryable || err.kind === 'aborted') { result.blocked = err; break; } // try again later
                this.outbox.remove(pending.boardKey, pending.score);
                result.dropped.set(pending.boardKey, err.message);
            }
        }
        return result;
    }

    async submitRun(boardKey: string, score: number): Promise<RunOutcome> {
        if (!(score >= 1)) return { status: 'skipped' };
        const queued = this.outbox.list().find(p => p.boardKey === boardKey)?.score ?? 0;
        const known = Math.max(this.bests.get(boardKey), queued);
        if (score <= known) {
            if (queued >= score) return this.deliver(boardKey);      // this score (or a better one) is already waiting: send it now
            if (this.outbox.list().length > 0) await this.flush();   // otherwise nothing to send for this board, but retry what else is waiting
            return { status: 'not-better', best: Math.max(known, this.bests.get(boardKey)) };
        }
        this.outbox.add(boardKey, score);
        return this.deliver(boardKey);
    }

    /** Flushes the outbox and reports what happened to the score of one board. */
    private async deliver(boardKey: string): Promise<RunOutcome> {
        const flushed = await this.flush();
        const sent = flushed.sent.get(boardKey);
        if (sent) return { status: 'sent', response: sent };
        const dropped = flushed.dropped.get(boardKey);
        if (dropped !== undefined) return { status: 'rejected', reason: dropped };
        if (flushed.blocked === 'no-nickname') return { status: 'needs-nickname' };
        return { status: 'queued', reason: flushed.blocked instanceof LeaderboardError ? flushed.blocked.message : 'Could not reach the leaderboard.' };
    }
}
