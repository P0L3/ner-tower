// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// zzfx creates an AudioContext at import time; jsdom has none.
vi.mock('../core/audio', () => ({ resumeAudio: () => {} }));

import { mountMenu, type StartPayload } from './menu';
import { DatasetCache, memoryStore } from '../data/cache';
import { clirenerGold } from '../data/sources/clirener-gold';
import { clirenerSilver } from '../data/sources/clirener-silver';
import { SourceLoadError } from '../data/sources/errors';
import { makeSyntheticDataset } from '../data/fixtures/synthetic';
import { canonicalize } from '../data/canonical';
import type { DatasetSource } from '../data/sources/types';

const tick = () => new Promise(r => setTimeout(r, 0));
async function until(f: () => boolean) { for (let i = 0; i < 50 && !f(); i++) await tick(); }

function fakeSource(base: DatasetSource, load: DatasetSource['load']): DatasetSource { return { ...base, load }; }
const canonical = canonicalize(makeSyntheticDataset(40, 5, 2));
const okLoad: DatasetSource['load'] = async o => { o?.onProgress?.({ phase: 'download', loaded: 10, total: 40 }); return { canonical, rowsRead: 40, rowsSkipped: 0 }; };

let canvas: HTMLCanvasElement;
beforeEach(() => { document.body.innerHTML = '<div id="game-container"><canvas></canvas></div>'; canvas = document.querySelector('canvas')!; });

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
        expect(started[0].settings).toMatchObject({ baseSpeed: 0.5, speedInc: 0.15, phaseDist: 100, datasetHash: canonical.contentHash.slice(0, 16) });
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

    it('rejects a share code made for another dataset without starting', async () => {
        const { started } = mount([fakeSource(clirenerGold, okLoad)]);
        (document.querySelector('.nt-code') as HTMLInputElement).value = btoa('0123456789abcdef|1|0.5|0.1|100');
        button('Play')!.click();
        await until(() => document.querySelector('.nt-error') !== null);
        expect(document.querySelector('.nt-error')!.textContent).toContain('different dataset');
        expect(started).toHaveLength(0);
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
});
