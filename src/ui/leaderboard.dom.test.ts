// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../core/audio', () => ({ resumeAudio: () => {}, playSound: () => {}, sndJump: [] })); // zzfx creates an AudioContext at import time

import { mountBoard } from './boardView';
import { mountNicknamePrompt } from './nicknamePrompt';
import { mountGameOverPanel } from './gameOverPanel';
import { mountMenu } from './menu';
import { createBackend } from '../leaderboard/fakeBackend.testutil';
import { boardKey } from '../config/board';
import { weeklySettings } from '../config/weekly';
import { encodeShareCode } from '../config/shareCode';
import { classicSettings } from '../config/classic';
import { DatasetCache, memoryStore } from '../data/cache';
import { canonicalize } from '../data/canonical';
import { makeSyntheticDataset } from '../data/fixtures/synthetic';
import { clirenerGold } from '../data/sources/clirener-gold';
import type { DatasetSource } from '../data/sources/types';
import type { GameSettings } from '../config/settings';

const tick = () => new Promise(r => setTimeout(r, 0));
async function until(f: () => boolean, tries = 100) { for (let i = 0; i < tries && !f(); i++) await tick(); if (!f()) throw new Error('condition not reached'); }
const text = () => document.body.textContent ?? '';
const button = (label: string) => [...document.querySelectorAll('button')].find(b => b.textContent === label) as HTMLButtonElement | undefined;

const SETTINGS: GameSettings = { datasetId: 'P0L3/CliReNER_v_1_1_28_GOLD', contentHash: '0123456789abcdef', seed: 482913, baseSpeed: 0.5, speedInc: 0.15, phaseDist: 100 };
const KEY = boardKey(SETTINGS);

let canvas: HTMLCanvasElement;
beforeEach(() => { localStorage.clear(); document.body.innerHTML = '<div id="game-container"><canvas width="850" height="800"></canvas></div>'; canvas = document.querySelector('canvas')!; });

describe('board view', () => {
    it('lists the top entries, and shows the player their exact rank when it is far below', async () => {
        const be = await createBackend();
        for (let i = 1; i <= 30; i++) await be.newLeaderboard(`P${i}`).submitRun(KEY, i * 10);   // P30 is first
        const me = be.newLeaderboard('Me');
        await me.submitRun(KEY, 5);                                                              // last: rank 31
        mountBoard(document.body, { leaderboard: me, boardKey: KEY, title: 'Gold', subtitle: 'seed 1', limit: 5 });
        await until(() => document.querySelectorAll('tr').length > 0);
        const rows = [...document.querySelectorAll('tr')].map(r => r.textContent);
        expect(rows).toEqual(['1P30300 m', '2P29290 m', '3P28280 m', '4P27270 m', '5P26260 m', '\u22ee', '31Me (you)5 m']);
        expect(document.querySelector('.is-you')!.textContent).toContain('Me (you)');
        expect(text()).toContain('31 players');
        expect(text()).toContain('Gold');
    });

    it('marks the player inside the top list without repeating the row', async () => {
        const be = await createBackend();
        const me = be.newLeaderboard('Me');
        await me.submitRun(KEY, 50);
        await be.newLeaderboard('Other').submitRun(KEY, 10);
        mountBoard(document.body, { leaderboard: me, boardKey: KEY, title: 't' });
        await until(() => document.querySelectorAll('tr').length === 2);
        expect([...document.querySelectorAll('tr')].map(r => r.textContent)).toEqual(['1Me (you)50 m', '2Other10 m']);
        expect(document.querySelector('.nt-gap')).toBeNull();
    });

    it('says so when nobody has played yet', async () => {
        const be = await createBackend();
        mountBoard(document.body, { leaderboard: be.newLeaderboard('Me'), boardKey: KEY, title: 't' });
        await until(() => text().includes('No scores yet'));
    });

    it('shows an error with a working Retry when the leaderboard is unreachable', async () => {
        const be = await createBackend();
        be.state.down = true;
        mountBoard(document.body, { leaderboard: be.newLeaderboard('Me'), boardKey: KEY, title: 't' });
        await until(() => document.querySelector('.nt-error') !== null);
        expect(text()).toContain('Could not reach the leaderboard');
        be.state.down = false;
        button('Retry')!.click();
        await until(() => text().includes('No scores yet'));
    });

    it('never shows markup from nicknames as HTML', async () => {
        const be = await createBackend();
        await be.newLeaderboard('<b>x</b>').submitRun(KEY, 5);
        mountBoard(document.body, { leaderboard: be.newLeaderboard('Me'), boardKey: KEY, title: 't' });
        await until(() => document.querySelectorAll('tr').length > 0);
        expect(document.querySelector('.nt-name b')).toBeNull();
        expect(document.querySelector('.nt-name')!.textContent).toBe('<b>x</b>');
    });

    it('destroy removes the view and ignores a late answer', async () => {
        const be = await createBackend();
        const v = mountBoard(document.body, { leaderboard: be.newLeaderboard('Me'), boardKey: KEY, title: 't' });
        v.destroy();
        await tick(); await tick();
        expect(document.querySelector('.nt-board')).toBeNull();
    });
});

describe('nickname prompt', () => {
    it('refuses an invalid name, saves a valid one cleaned, and can be skipped', () => {
        const saved: string[] = []; let skipped = 0;
        mountNicknamePrompt(document.body, { onSave: n => saved.push(n), onSkip: () => skipped++ });
        const input = document.querySelector('input')!;
        button('Save and submit')!.click();
        expect(saved).toEqual([]);
        expect(document.querySelector('.is-error')!.textContent).toContain('1 to 20');
        input.value = '  Ada   L ';
        button('Save and submit')!.click();
        expect(saved).toEqual(['Ada L']);
        button('Not now')!.click();
        expect(skipped).toBe(1);
    });

    it('Enter saves, and typing never reaches the game (Phaser listens on window)', () => {
        const saved: string[] = []; const leaked: string[] = [];
        window.addEventListener('keydown', e => leaked.push(e.key));
        mountNicknamePrompt(document.body, { onSave: n => saved.push(n), onSkip: () => {} });
        const input = document.querySelector('input')!;
        input.focus();
        expect(document.activeElement).toBe(input);
        for (const key of ['r', 's', 'n']) input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        input.value = 'Zed';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(saved).toEqual(['Zed']);
        expect(leaked).toEqual([]);
    });
});

describe('game over panel', () => {
    it('first run: asks for a nickname, holds the score, then submits and shows the exact rank', async () => {
        const be = await createBackend();
        await be.newLeaderboard('Rival').submitRun(KEY, 500);
        const lb = be.newLeaderboard();
        mountGameOverPanel({ canvas, leaderboard: lb, settings: SETTINGS, score: 120, datasetTitle: 'CliReNER Gold' });
        await until(() => document.querySelector('.nt-prompt') !== null);
        expect(be.posts()).toHaveLength(1);                       // only Rival's own
        expect(lb.outbox.list()).toEqual([{ boardKey: KEY, score: 120 }]);

        document.querySelector('input')!.value = 'Ada';
        button('Save and submit')!.click();
        await until(() => document.querySelector('.nt-table') !== null);
        expect(lb.player.nickname).toBe('Ada');
        expect(text()).toContain('New personal best on this board: rank 2 of 2.');
        expect(text()).toContain('CliReNER Gold');
        expect(document.querySelector('.is-you')!.textContent).toContain('Ada (you)');
        expect(lb.outbox.list()).toEqual([]);
        expect(document.querySelector('.nt-prompt')).toBeNull();
    });

    it('later runs submit on their own, without asking again', async () => {
        const be = await createBackend();
        const lb = be.newLeaderboard('Ada');
        mountGameOverPanel({ canvas, leaderboard: lb, settings: SETTINGS, score: 50, datasetTitle: undefined });
        await until(() => document.querySelector('.nt-table') !== null);
        expect(document.querySelector('.nt-prompt')).toBeNull();
        expect(be.posts()).toHaveLength(1);
        expect(text()).toContain('rank 1 of 1');
    });

    it('a worse run than your best says so', async () => {
        const be = await createBackend();
        const lb = be.newLeaderboard('Ada');
        await lb.submitRun(KEY, 300);
        mountGameOverPanel({ canvas, leaderboard: lb, settings: SETTINGS, score: 40, datasetTitle: undefined });
        await until(() => text().includes('Your best on this board is 300 m'));
        expect(text()).toContain('nothing was sent');
        expect(be.posts()).toHaveLength(1);
    });

    it('skipping keeps the score queued, stops asking, and still shows the board', async () => {
        const be = await createBackend();
        const lb = be.newLeaderboard();
        mountGameOverPanel({ canvas, leaderboard: lb, settings: SETTINGS, score: 70, datasetTitle: undefined });
        await until(() => document.querySelector('.nt-prompt') !== null);
        button('Not now')!.click();
        await until(() => text().includes('Add a nickname in the menu to send it'));
        expect(lb.promptDeclined).toBe(true);
        expect(lb.outbox.list()).toEqual([{ boardKey: KEY, score: 70 }]);
        expect(document.querySelector('.nt-board')).not.toBeNull();
        // next game over in the same session: no prompt
        document.body.innerHTML = '<div id="game-container"><canvas width="850" height="800"></canvas></div>';
        mountGameOverPanel({ canvas: document.querySelector('canvas')!, leaderboard: lb, settings: SETTINGS, score: 80, datasetTitle: undefined });
        await until(() => document.querySelector('.nt-board') !== null);
        expect(document.querySelector('.nt-prompt')).toBeNull();
        expect(lb.outbox.list()).toEqual([{ boardKey: KEY, score: 80 }]);
    });

    it('an outage never blocks: the score stays queued and is delivered later', async () => {
        const be = await createBackend();
        const lb = be.newLeaderboard('Ada');
        be.state.down = true;
        mountGameOverPanel({ canvas, leaderboard: lb, settings: SETTINGS, score: 90, datasetTitle: undefined });
        await until(() => text().includes('saved and will be sent next time'));
        await until(() => document.querySelector('.nt-error') !== null); // the board is unreachable too, with its own Retry
        be.state.down = false;
        expect((await lb.flush()).sent.get(KEY)).toMatchObject({ best: 90 });
    });

    it('labels weekly runs and cleans up on destroy', async () => {
        const be = await createBackend();
        const weekly = weeklySettings(new Date('2026-10-25T10:00:00Z'), SETTINGS.datasetId, SETTINGS.contentHash);
        const p = mountGameOverPanel({ canvas, leaderboard: be.newLeaderboard('Ada'), settings: weekly, score: 10, datasetTitle: 'CliReNER Gold' });
        await until(() => document.querySelector('.nt-table') !== null);
        expect(text()).toContain('Weekly 2026-W43: CliReNER Gold');
        p.destroy();
        expect(document.querySelector('.nt-gop')).toBeNull();
    });
});

describe('menu with a leaderboard', () => {
    const canonical = canonicalize(makeSyntheticDataset(40, 5, 2));
    const source = (): DatasetSource => ({ ...clirenerGold, load: async () => ({ canonical, rowsRead: 40, rowsSkipped: 0 }) });
    const mount = (lb?: ReturnType<Awaited<ReturnType<typeof createBackend>>['newLeaderboard']>) =>
        mountMenu({ canvas, sources: [source()], cache: new DatasetCache(memoryStore()), onStart: () => {}, leaderboard: lb });

    it('shows nothing leaderboard related in a build without one', () => {
        mount();
        expect(button('Weekly leaderboard')).toBeUndefined();
        expect(document.querySelector('input[aria-label="Nickname"]')).toBeNull();
    });

    it('saves the nickname, rejects a bad one, and sends scores that were waiting for it', async () => {
        const be = await createBackend();
        const lb = be.newLeaderboard();
        lb.outbox.add(KEY, 33);
        mount(lb);
        const nick = document.querySelector('input[aria-label="Nickname"]') as HTMLInputElement;
        nick.value = 'x'.repeat(20) + '\u0007';
        nick.dispatchEvent(new Event('change'));
        expect(document.body.textContent).toContain('Use 1 to 20 characters');
        expect(lb.player.nickname).toBeUndefined();
        nick.value = '  Ada ';
        nick.dispatchEvent(new Event('change'));
        expect(lb.player.nickname).toBe('Ada');
        await until(() => be.posts().length === 1);
        await until(() => lb.outbox.list().length === 0);
    });

    it('the weekly leaderboard loads the dataset, then shows that week\'s board', async () => {
        const be = await createBackend();
        const lb = be.newLeaderboard('Ada');
        const weekly = weeklySettings(new Date(), clirenerGold.datasetId, canonical.contentHash.slice(0, 16));
        await lb.submitRun(boardKey(weekly), 77);
        mount(lb);
        button('Weekly leaderboard')!.click();
        await until(() => document.querySelector('.nt-modal .nt-table') !== null);
        expect(be.state.requests.at(-1)).toContain(`/boards/${boardKey(weekly)}`);
        expect(document.querySelector('.nt-modal')!.textContent).toContain(`Weekly ${weekly.weekly}`);
        expect(document.querySelector('.is-you')!.textContent).toContain('Ada (you)');
        button('Close')!.click();
        expect(document.querySelector('.nt-modal')).toBeNull();
    });

    it('a pasted share code offers its board, with no dataset download', async () => {
        const be = await createBackend();
        const lb = be.newLeaderboard('Ada');
        const loads = vi.fn(async () => ({ canonical, rowsRead: 40, rowsSkipped: 0 }));
        mountMenu({ canvas, sources: [{ ...clirenerGold, load: loads }], cache: new DatasetCache(memoryStore()), onStart: () => {}, leaderboard: lb });
        button('Replay a run')!.click();
        const box = document.querySelector('.nt-code[placeholder^="Paste"]') as HTMLInputElement;
        expect(button('View the leaderboard for this code')!.hidden).toBe(true);
        box.value = encodeShareCode(SETTINGS);
        box.dispatchEvent(new Event('input'));
        expect(button('View the leaderboard for this code')!.hidden).toBe(false);
        button('View the leaderboard for this code')!.click();
        await until(() => document.querySelector('.nt-modal') !== null && be.state.requests.some(r => r.includes(`/boards/${KEY}`)));
        expect(loads).not.toHaveBeenCalled();
        box.value = 'garbage';
        box.dispatchEvent(new Event('input'));
        expect(button('View the leaderboard for this code')!.hidden).toBe(true);
    });

    it('the Classic leaderboard opens straight from the pinned hash, with no download', async () => {
        const be = await createBackend();
        const lb = be.newLeaderboard('Ada');
        const pinned = canonical.contentHash.slice(0, 16);
        const classic = classicSettings(clirenerGold.datasetId, pinned);
        await lb.submitRun(boardKey(classic), 88);
        const loads = vi.fn(async () => ({ canonical, rowsRead: 40, rowsSkipped: 0 }));
        mountMenu({ canvas, sources: [{ ...clirenerGold, classicHash: pinned, load: loads }], cache: new DatasetCache(memoryStore()), onStart: () => {}, leaderboard: lb });
        button('Leaderboards')!.click();
        button('Classic leaderboard')!.click();
        await until(() => document.querySelector('.nt-modal .nt-table') !== null);
        expect(be.state.requests.at(-1)).toContain(`/boards/${boardKey(classic)}`);
        expect(document.querySelector('.nt-modal')!.textContent).toContain('Classic: CliReNER Gold');
        expect(document.querySelector('.is-you')!.textContent).toContain('Ada (you)');
        expect(loads).not.toHaveBeenCalled();
    });

    it('the Classic leaderboard is off for a dataset without a pinned hash', async () => {
        const be = await createBackend();
        mount(be.newLeaderboard('Ada'));
        expect(button('Classic leaderboard')!.disabled).toBe(true);
    });

    it('Escape closes the board', async () => {
        const be = await createBackend();
        mount(be.newLeaderboard('Ada'));
        button('Weekly leaderboard')!.click();
        await until(() => document.querySelector('.nt-modal') !== null);
        document.querySelector('.nt-modal')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.querySelector('.nt-modal')).toBeNull();
    });
});
