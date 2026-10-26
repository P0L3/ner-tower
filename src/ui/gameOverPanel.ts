import './leaderboard.css';
import { h, pinToCanvas, formatInt } from './dom';
import { mountBoard, type BoardViewHandle } from './boardView';
import { mountNicknamePrompt } from './nicknamePrompt';
import { describeBoard } from './menuLogic';
import { boardKey } from '../config/board';
import type { GameSettings } from '../config/settings';
import type { Leaderboard } from '../leaderboard/service';

export interface GameOverPanelOptions {
    canvas: HTMLCanvasElement;
    leaderboard: Leaderboard;
    settings: GameSettings;
    score: number;
    /** Title of the dataset, for the board heading. */
    datasetTitle: string | undefined;
}

/** Game coordinates of the panel on the game over screen (the Phaser text is laid out around it). */
export const GAME_OVER_PANEL_RECT = { x: 145, y: 290, w: 560, h: 400 } as const;

/**
 * Game over leaderboard flow. The score goes to the outbox first, so nothing here can lose it or
 * block the game:
 *   no nickname yet -> ask for one (first run only), then submit
 *   submit          -> show how it went, and the board with the player's exact rank
 *   failure         -> the score stays queued and is retried later; the board is shown if reachable
 */
export function mountGameOverPanel(o: GameOverPanelOptions): { destroy(): void } {
    const { leaderboard: lb, settings, score } = o;
    const key = boardKey(settings);
    let destroyed = false;
    let board: BoardViewHandle | undefined;
    let prompt: { destroy(): void } | undefined;

    const note = h('p', { class: 'nt-note' });
    note.setAttribute('aria-live', 'polite');
    const body = h('div', { class: 'nt-gop-body' });
    const root = h('div', { class: 'nt-gop' }, note, body);
    const unpin = pinToCanvas(o.canvas, root, GAME_OVER_PANEL_RECT);

    const clear = () => { board?.destroy(); board = undefined; prompt?.destroy(); prompt = undefined; body.replaceChildren(); };
    const showBoard = () => {
        clear();
        const { title, subtitle } = describeBoard(settings, () => o.datasetTitle);
        board = mountBoard(body, { leaderboard: lb, boardKey: key, title, subtitle, limit: 10 });
    };
    const showPrompt = () => {
        clear();
        prompt = mountNicknamePrompt(body, {
            onSave: name => { lb.player.setNickname(name); void run(); },
            onSkip: () => {
                lb.promptDeclined = true;
                note.textContent = 'Your score is saved. Add a nickname in the menu to send it.';
                showBoard();
            },
        });
    };

    async function run(): Promise<void> {
        if (destroyed) return;
        if (lb.player.nickname === undefined && lb.promptDeclined) {
            lb.outbox.add(key, score);
            note.textContent = 'Your score is saved. Add a nickname in the menu to send it.';
            showBoard();
            return;
        }
        note.textContent = 'Submitting your score\u2026';
        let outcome;
        try { outcome = await lb.submitRun(key, score); } catch { outcome = { status: 'queued' as const, reason: 'Could not reach the leaderboard.' }; }
        if (destroyed) return;
        switch (outcome.status) {
            case 'needs-nickname': note.textContent = ''; showPrompt(); return;
            case 'sent': {
                const r = outcome.response;
                note.textContent = r.improved ? `New personal best on this board: rank ${formatInt(r.rank)} of ${formatInt(r.total)}.`
                    : `Your best on this board is ${formatInt(r.best)} m: rank ${formatInt(r.rank)} of ${formatInt(r.total)}.`;
                break;
            }
            case 'not-better':
                note.textContent = `Your best on this board is ${formatInt(outcome.best)} m. This run did not beat it, so nothing was sent.`;
                break;
            case 'queued': note.textContent = `${outcome.reason} Your score is saved and will be sent next time.`; break;
            case 'rejected': note.textContent = `The leaderboard did not accept this score: ${outcome.reason}`; break;
            case 'skipped': note.textContent = ''; break;
        }
        showBoard();
    }

    void run();
    return { destroy() { destroyed = true; clear(); unpin(); } };
}
