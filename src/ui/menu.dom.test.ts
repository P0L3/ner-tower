// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// zzfx creates an AudioContext at import time; jsdom has none.
vi.mock('../core/audio', () => ({ resumeAudio: () => {}, playSound: () => {}, sndJump: [] }));

import { mountMenu, type StartPayload } from './menu';
import { DatasetCache, memoryStore } from '../data/cache';
import { clirenerGold } from '../data/sources/clirener-gold';
import { clirenerSilver } from '../data/sources/clirener-silver';
import { SourceLoadError } from '../data/sources/errors';
import { makeSyntheticDataset } from '../data/fixtures/synthetic';
import { canonicalize } from '../data/canonical';
import type { DatasetSource } from '../data/sources/types';
import { encodeShareCode } from '../config/shareCode';
import { weeklySettings } from '../config/weekly';
import { LOCAL_DATASET_ID } from '../config/settings';
import { classicSettings } from '../config/classic';
import { loadVolumes } from '../core/volume';

const tick = () => new Promise(r => setTimeout(r, 0));
async function until(f: () => boolean) { for (let i = 0; i < 50 && !f(); i++) await tick(); }

function fakeSource(base: DatasetSource, load: DatasetSource['load']): DatasetSource { return { ...base, load }; }
const canonical = canonicalize(makeSyntheticDataset(40, 5, 2));
const okLoad: DatasetSource['load'] = async o => { o?.onProgress?.({ phase: 'download', loaded: 10, total: 40 }); return { canonical, rowsRead: 40, rowsSkipped: 0 }; };

let canvas: HTMLCanvasElement;
beforeEach(() => { localStorage.clear(); document.body.innerHTML = '<div id="game-container"><canvas></canvas></div>'; canvas = document.querySelector('canvas')!; });

const mount = (sources: DatasetSource[], cache = new DatasetCache(memoryStore())) => {
    const started: StartPayload[] = [];
    const menu = mountMenu({ canvas, sources, cache, onStart: p => started.push(p) });
    return { started, menu, cache };
};
const button = (label: string) => [...document.querySelectorAll('button')].find(b => b.textContent === label) as HTMLButtonElement | undefined;

describe('menu', () => {
    it('lists the sources with title, size, license and an attribution link, and removes itself on destroy', () => {
        const { menu } = mount([clirenerGold, clirenerSilver]);
        const text = document.querySelector('.nt-overlay')!.textContent!;
        for (const t of ['CliReNER Gold', 'CliReNER Silver', '192 sentences', '1,027 sentences', 'License CC BY 4.0']) expect(text).toContain(t);
        expect(document.querySelectorAll('.nt-card')).toHaveLength(2);
        expect((document.querySelector('.nt-card a') as HTMLAnchorElement).href).toBe(clirenerGold.url);
        menu.destroy();
        expect(document.querySelector('.nt-overlay')).toBeNull();
    });

    it('selecting a card and pressing Play loads it, saves it and hands over the dataset and palette', async () => {
        const load = vi.fn(okLoad);
        const { started, cache } = mount([fakeSource(clirenerGold, load), fakeSource(clirenerSilver, okLoad)]);
        (document.querySelectorAll('.nt-card')[0] as HTMLElement).click();
        button('Play')!.click();
        await until(() => started.length > 0);
        expect(started).toHaveLength(1);
        expect(started[0].dataset).toEqual(canonical.sentences);
        expect(started[0].palette).toBe(clirenerGold.palette);
        expect(started[0].settings).toMatchObject({ baseSpeed: 0.5, speedInc: 0.15, phaseDist: 100, datasetId: clirenerGold.datasetId, contentHash: canonical.contentHash.slice(0, 16) });
        expect(await cache.has(clirenerGold)).toBe(true);
    });

    it('shows the error with a Retry that succeeds on the second attempt', async () => {
        let n = 0;
        const flaky: DatasetSource['load'] = async o => { if (n++ === 0) throw new SourceLoadError('http', 'Hugging Face is having trouble (HTTP 503).', 503); return okLoad(o); };
        const { started } = mount([fakeSource(clirenerGold, flaky)]);
        button('Play')!.click();
        await until(() => document.querySelector('.nt-error') !== null);
        expect(document.querySelector('.nt-error')!.textContent).toContain('HTTP 503');
        button('Retry')!.click();
        await until(() => started.length > 0);
        expect(started).toHaveLength(1);
    });

    it('Cancel aborts quietly and the menu is usable again', async () => {
        const hanging: DatasetSource['load'] = o => new Promise((_, reject) => o!.signal!.addEventListener('abort', () => reject(new SourceLoadError('aborted', 'Loading was cancelled.'))));
        const { started } = mount([fakeSource(clirenerGold, hanging)]);
        button('Play')!.click();
        await tick();
        expect(button('Play')!.disabled).toBe(true);
        button('Cancel')!.click();
        await until(() => !button('Play')!.disabled);
        expect(document.querySelector('.nt-error')).toBeNull();
        expect(started).toHaveLength(0);
    });

    const openReplay = () => button('Replay a run')!.click();
    const codeBox = () => document.querySelector('.nt-code') as HTMLInputElement;
    const type = (v: string) => { codeBox().value = v; codeBox().dispatchEvent(new Event('input')); };
    const hint = () => document.querySelector('.nt-hint')!;
    const made = { datasetId: clirenerSilver.datasetId, contentHash: canonical.contentHash.slice(0, 16), seed: 99, baseSpeed: 1, speedInc: 0.5, phaseDist: 60 };

    it('a pasted code selects its dataset and replays exactly that run, whatever the sliders say', async () => {
        const goldLoad = vi.fn(okLoad), silverLoad = vi.fn(okLoad);
        const { started } = mount([fakeSource(clirenerGold, goldLoad), fakeSource(clirenerSilver, silverLoad)]);
        openReplay();
        type(encodeShareCode(made));
        expect(hint().textContent).toContain('CliReNER Silver');
        expect((document.querySelectorAll('.nt-card')[1] as HTMLElement).getAttribute('aria-checked')).toBe('true');
        expect((document.querySelector('input[aria-label="Base speed"]') as HTMLInputElement).value).toBe('0.5');
        button('Play this code')!.click();
        await until(() => started.length > 0);
        expect(started[0].settings).toEqual(made);
        expect(goldLoad).not.toHaveBeenCalled();
        expect(silverLoad).toHaveBeenCalledTimes(1);
    });

    it('explains a bad code as you type, and refuses to start with it', async () => {
        const { started } = mount([fakeSource(clirenerGold, okLoad)]);
        openReplay();
        type('NT1-garbage');
        expect(hint().classList.contains('is-error')).toBe(true);
        button('Play this code')!.click();
        await tick();
        expect(document.querySelector('.nt-error')!.textContent).toMatch(/damaged|does not look/);
        expect(started).toHaveLength(0);
    });

    it('refuses a code whose data has changed since it was made', async () => {
        const { started } = mount([fakeSource(clirenerGold, okLoad)]);
        openReplay();
        type(encodeShareCode({ ...made, datasetId: clirenerGold.datasetId, contentHash: '0123456789abcdef' }));
        button('Play this code')!.click();
        await until(() => document.querySelector('.nt-error') !== null);
        expect(document.querySelector('.nt-error')!.textContent).toContain('different data');
        expect(started).toHaveLength(0);
    });

    it('a code for a dropped file asks for that file, and accepts it when dropped', async () => {
        const { started } = mount([fakeSource(clirenerGold, okLoad)]);
        const rows = [{ tokenized_text: ['Marie', 'Curie', 'left'], ner: [[0, 1, 'PERSON']] }];
        const file = new File([JSON.stringify(rows)], 'd.json');
        const fileHash = canonicalize(rows).contentHash.slice(0, 16);
        openReplay();
        type(encodeShareCode({ ...made, datasetId: LOCAL_DATASET_ID, contentHash: fileHash }));
        expect(hint().textContent).toContain('Drop the same file');
        button('Play this code')!.click();
        await tick();
        expect(document.querySelector('.nt-error')!.textContent).toContain('Drop that same file');
        const drop = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer?: unknown };
        drop.dataTransfer = { files: [file] };
        document.querySelector('.nt-overlay')!.dispatchEvent(drop);
        await until(() => started.length > 0);
        expect(started[0].settings).toMatchObject({ datasetId: LOCAL_DATASET_ID, contentHash: fileHash, seed: 99 });
    });

    it('the weekly challenge button starts the weekly configuration for the selected dataset', async () => {
        const { started } = mount([fakeSource(clirenerGold, okLoad)]);
        const weekly = [...document.querySelectorAll('button')].find(b => b.textContent!.startsWith('Weekly challenge'))!;
        expect(weekly.textContent).toMatch(/^Weekly challenge \d{4}-W\d{2}$/);
        weekly.click();
        await until(() => started.length > 0);
        expect(started[0].settings).toEqual(weeklySettings(new Date(), clirenerGold.datasetId, canonical.contentHash.slice(0, 16)));
        expect(started[0].settings.weekly).toBeDefined();
    });

    it('starts from a dropped file, with generated colors', async () => {
        const { started } = mount([clirenerGold]);
        const file = new File([JSON.stringify([{ tokenized_text: ['Marie', 'Curie', 'left'], ner: [[0, 1, 'PERSON']] }])], 'd.json');
        const drop = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer?: unknown };
        drop.dataTransfer = { files: [file] };
        document.querySelector('.nt-overlay')!.dispatchEvent(drop);
        await until(() => started.length > 0);
        expect(started[0].palette).toBeUndefined();
        expect(started[0].dataset).toHaveLength(1);
    });

    it('shows a readable error for a bad dropped file', async () => {
        const { started } = mount([clirenerGold]);
        const drop = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer?: unknown };
        drop.dataTransfer = { files: [new File(['just some prose'], 'x.txt')] };
        document.querySelector('.nt-overlay')!.dispatchEvent(drop);
        await until(() => document.querySelector('.nt-error') !== null);
        expect(document.querySelector('.nt-error')!.textContent).toMatch(/last column must be/);
        expect(started).toHaveLength(0);
    });

    it('a share code in the box does not affect a plain Play, or a file dropped on another screen', async () => {
        const { started } = mount([fakeSource(clirenerGold, okLoad)]);
        openReplay();
        type(encodeShareCode({ ...made, datasetId: clirenerGold.datasetId, contentHash: canonical.contentHash.slice(0, 16) }));
        button('Back')!.click();
        button('Play')!.click();
        await until(() => started.length > 0);
        expect(started[0].settings.seed).not.toBe(99);
    });
});

describe('menu screens', () => {
    const visible = () => [...document.querySelectorAll('.nt-view')].filter(v => !(v as HTMLElement).hidden).map(v => v.querySelector('.nt-h')?.textContent ?? 'main');
    it('starts on a short main screen, and moves between screens with Back', () => {
        mount([clirenerGold, clirenerSilver]);
        expect(visible()).toEqual(['Dataset']);
        button('Settings')!.click();
        expect(visible()).toEqual(['Settings']);
        button('Back')!.click();
        expect(visible()).toEqual(['Dataset']);
        button('Change dataset')!.click();
        expect(visible()).toEqual(['Choose a dataset']);
        document.querySelector('.nt-overlay')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(visible()).toEqual(['Dataset']);
    });
    it('choosing a dataset returns to the main screen, shows it in the chip and remembers it', () => {
        mount([clirenerGold, clirenerSilver]);
        expect(document.querySelector('.nt-chip-title')!.textContent).toBe('CliReNER Gold');
        button('Change dataset')!.click();
        (document.querySelectorAll('.nt-card')[1] as HTMLElement).click();
        expect(visible()).toEqual(['Dataset']);
        expect(document.querySelector('.nt-chip-title')!.textContent).toBe('CliReNER Silver');
        document.body.innerHTML = '<div id="game-container"><canvas></canvas></div>';
        canvas = document.querySelector('canvas')!;
        mount([clirenerGold, clirenerSilver]);
        expect(document.querySelector('.nt-chip-title')!.textContent).toBe('CliReNER Silver');
    });
    it('the sound sliders are saved, and effects start quieter than music', () => {
        mount([clirenerGold]);
        const music = document.querySelector('input[aria-label="Music"]') as HTMLInputElement;
        const effects = document.querySelector('input[aria-label="Effects"]') as HTMLInputElement;
        expect(Number(music.value)).toBeGreaterThan(Number(effects.value));
        music.value = '35'; music.dispatchEvent(new Event('input'));
        expect(loadVolumes().music).toBe(0.35);
    });
});

describe('classic challenge in the menu', () => {
    const pinned = canonical.contentHash.slice(0, 16);
    const classicSource = (hash: string | undefined) => ({ ...fakeSource(clirenerGold, okLoad), classicHash: hash });
    it('is off for a dataset without a pinned hash, and says so', () => {
        mount([classicSource(undefined)]);
        expect(button('Classic challenge')!.disabled).toBe(true);
        expect(document.body.textContent).toContain('No Classic challenge for this dataset');
    });
    it('starts the one fixed configuration of the dataset', async () => {
        const { started } = mount([classicSource(pinned)]);
        expect(button('Classic challenge')!.disabled).toBe(false);
        button('Classic challenge')!.click();
        await until(() => started.length > 0);
        expect(started[0].settings).toEqual(classicSettings(clirenerGold.datasetId, pinned));
    });
    it('is paused, with an explanation, when the loaded data is not the pinned data', async () => {
        const { started } = mount([classicSource('0123456789abcdef')]);
        button('Classic challenge')!.click();
        await until(() => document.querySelector('.nt-error') !== null);
        expect(document.querySelector('.nt-error')!.textContent).toContain('paused');
        expect(started).toHaveLength(0);
    });
});
