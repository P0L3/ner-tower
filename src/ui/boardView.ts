import './leaderboard.css';
import { h, formatInt } from './dom';
import { LeaderboardError } from '../leaderboard/client';
import type { Leaderboard } from '../leaderboard/service';
import type { BoardResponse } from '../leaderboard/protocol';

export interface BoardViewOptions {
    leaderboard: Leaderboard;
    boardKey: string;
    title: string;
    subtitle?: string;
    /** Rows to show (the player's own exact rank is shown below them if they are further down). */
    limit?: number;
}

export interface BoardViewHandle { refresh(): Promise<void>; destroy(): void }

/** A leaderboard table: top entries, and the player's exact rank even when it is far outside them. */
export function mountBoard(host: HTMLElement, opts: BoardViewOptions): BoardViewHandle {
    const { leaderboard, boardKey, limit = 10 } = opts;
    let destroyed = false;
    let ctl: AbortController | undefined;

    const body = h('div', { class: 'nt-board-body' });
    body.setAttribute('aria-live', 'polite');
    const refreshBtn = h('button', { type: 'button', class: 'nt-link', textContent: 'Refresh', onclick: () => void refresh() });
    const root = h('div', { class: 'nt-board' },
        h('div', { class: 'nt-board-head' },
            h('div', {}, h('h2', { class: 'nt-h', textContent: opts.title }), ...(opts.subtitle ? [h('div', { class: 'nt-hint', textContent: opts.subtitle })] : [])),
            refreshBtn),
        body);
    host.append(root);

    const row = (rank: number | string, name: string, score: number, you: boolean) =>
        h('tr', { class: you ? 'is-you' : '' },
            h('td', { class: 'nt-rank', textContent: typeof rank === 'number' ? formatInt(rank) : rank }),
            h('td', { class: 'nt-name', textContent: you ? `${name} (you)` : name }),
            h('td', { class: 'nt-score', textContent: `${formatInt(score)} m` }));

    function render(b: BoardResponse) {
        body.replaceChildren();
        if (b.total === 0) { body.append(h('p', { class: 'nt-empty', textContent: 'No scores yet. Be the first.' })); return; }
        const table = h('table', { class: 'nt-table' });
        const you = b.you;
        for (const e of b.entries) table.append(row(e.rank, e.nickname, e.score, you !== undefined && e.rank === you.rank));
        const lastShown = b.entries.length > 0 ? b.entries[b.entries.length - 1].rank : 0;
        if (you && you.rank > lastShown) {
            if (you.rank > lastShown + 1) table.append(h('tr', { class: 'nt-gap' }, h('td', { textContent: '\u22ee' }), h('td'), h('td')));
            table.append(row(you.rank, you.nickname, you.score, true));
        }
        body.append(table, h('p', { class: 'nt-hint', textContent: `${formatInt(b.total)} ${b.total === 1 ? 'player' : 'players'}` }));
    }

    async function refresh(): Promise<void> {
        ctl?.abort();
        const mine = new AbortController();
        ctl = mine;
        body.replaceChildren(h('p', { class: 'nt-empty', textContent: 'Loading\u2026' }));
        try {
            const b = await leaderboard.client.board(boardKey, { limit, playerId: leaderboard.player.id, signal: mine.signal });
            if (!destroyed && ctl === mine) render(b);
        } catch (e) {
            if (destroyed || ctl !== mine || (e instanceof LeaderboardError && e.kind === 'aborted')) return;
            body.replaceChildren(
                h('p', { class: 'nt-error', textContent: e instanceof LeaderboardError ? e.message : 'Could not load the leaderboard.' }),
                h('button', { type: 'button', class: 'nt-btn', textContent: 'Retry', onclick: () => void refresh() }));
        }
    }

    void refresh();
    return { refresh, destroy() { destroyed = true; ctl?.abort(); root.remove(); } };
}
