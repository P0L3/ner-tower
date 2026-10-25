import './menu.css';
import type { DatasetSource, LoadProgress } from '../data/sources/types';
import type { DatasetCache } from '../data/cache';
import type { CanonicalDataset } from '../data/canonical';
import type { SentenceData } from '../data/types';
import type { GameSettings } from '../config/settings';
import type { Palette } from '../game/palette';
import { loadSource } from '../data/sources/cached';
import { SourceLoadError } from '../data/sources/errors';
import { loadDatasetText } from '../data/load';
import { DatasetParseError } from '../data/formats/index';
import { resumeAudio } from '../core/audio';
import { buildSettings, describeProgress, sizeLabel } from './menuLogic';

/** Everything the game needs to start a run. */
export interface StartPayload {
    dataset: SentenceData[];
    settings: GameSettings;
    /** Label colors of the chosen source; absent for dropped files (colors are generated). */
    palette: Palette | undefined;
}

export interface MenuOptions {
    /** The game canvas; the menu is laid over it. */
    canvas: HTMLCanvasElement;
    sources: readonly DatasetSource[];
    cache: DatasetCache;
    onStart(payload: StartPayload): void;
}

export interface MenuHandle { destroy(): void }

type El<K extends keyof HTMLElementTagNameMap> = HTMLElementTagNameMap[K];

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<El<K>> & { class?: string } = {}, ...children: (Node | string)[]): El<K> {
    const { class: cls, ...rest } = props;
    const el = Object.assign(document.createElement(tag), rest);
    if (cls) el.className = cls;
    el.append(...children);
    return el;
}

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function mountMenu(opts: MenuOptions): MenuHandle {
    const { canvas, sources, cache } = opts;
    const host = canvas.parentElement ?? document.body;
    let destroyed = false;
    let selectedId = sources[0]?.id;
    let running: AbortController | undefined;

    // ---- layout: pinned to the canvas, follows resizes ----
    const overlay = h('div', { class: 'nt-overlay' });
    const place = () => {
        overlay.style.left = `${canvas.offsetLeft}px`;
        overlay.style.top = `${canvas.offsetTop}px`;
        overlay.style.width = `${canvas.clientWidth}px`;
        overlay.style.height = `${canvas.clientHeight}px`;
    };
    place();
    window.addEventListener('resize', place);

    // ---- dataset cards ----
    const cards = new Map<string, { card: HTMLElement; badge: HTMLElement }>();
    const sourceList = h('div', { class: 'nt-sources', role: 'radiogroup', ariaLabel: 'Dataset' } as Partial<HTMLDivElement>);
    const select = (id: string) => {
        selectedId = id;
        for (const [sid, { card }] of cards) card.setAttribute('aria-checked', String(sid === id));
        playBtn.disabled = busy();
    };
    for (const src of sources) {
        const colors = Object.values(src.palette ?? {});
        const strip = h('div', { class: 'nt-strip' }, ...(colors.length ? colors : [0x666666]).map(c => {
            const s = h('span'); s.style.background = hex(c); return s;
        }));
        const badge = h('span', { class: 'nt-badge', textContent: '' });
        const card = h('div', { class: 'nt-card' },
            strip,
            h('div', { class: 'nt-card-title', textContent: src.title }),
            h('div', { class: 'nt-card-desc', textContent: src.description }),
            h('div', { class: 'nt-card-meta' },
                h('span', { textContent: sizeLabel(src) }),
                h('span', { textContent: `License ${src.license}` }),
                h('a', { href: src.url, target: '_blank', rel: 'noopener noreferrer', textContent: 'Source' }),
                badge));
        card.setAttribute('role', 'radio');
        card.tabIndex = 0;
        card.addEventListener('click', e => { if (!(e.target instanceof HTMLAnchorElement)) select(src.id); });
        card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(src.id); } });
        cards.set(src.id, { card, badge });
        sourceList.append(card);
    }
    const refreshBadges = async () => {
        for (const src of sources) {
            const saved = await cache.has(src);
            if (!destroyed) cards.get(src.id)!.badge.textContent = saved ? 'Saved for offline play' : '';
        }
    };

    // ---- drop zone ----
    const fileInput = h('input', { type: 'file', accept: '.json,.jsonl,.txt,.conll,.bio,text/plain,application/json' });
    const dropZone = h('div', { class: 'nt-drop' },
        'Or drop your own dataset here (JSON, JSONL or CoNLL) or ',
        h('button', { type: 'button', class: 'nt-link', textContent: 'browse', onclick: () => fileInput.click() }),
        fileInput);
    for (const type of ['dragover', 'dragenter'] as const) {
        overlay.addEventListener(type, e => { e.preventDefault(); if (!busy()) dropZone.classList.add('is-over'); });
    }
    overlay.addEventListener('dragleave', e => { if (e.target === overlay || e.target === dropZone) dropZone.classList.remove('is-over'); });
    overlay.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('is-over');
        const file = e.dataTransfer?.files[0];
        if (file && !busy()) readFile(file);
    });
    fileInput.addEventListener('change', () => { const f = fileInput.files?.[0]; if (f && !busy()) readFile(f); fileInput.value = ''; });

    // ---- settings ----
    const slider = (label: string, min: number, max: number, step: number, value: number, suffix = '') => {
        const out = h('output', { textContent: value + suffix });
        const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), ariaLabel: label } as Partial<HTMLInputElement>);
        input.addEventListener('input', () => { out.textContent = input.value + suffix; });
        return { input, row: h('label', { class: 'nt-row' }, h('span', { textContent: label }), input, out) };
    };
    const base = slider('Base speed', 0.1, 2.0, 0.1, 0.5);
    const inc = slider('Speed inc', 0, 1.0, 0.05, 0.15);
    const phase = slider('Phase dist', 50, 500, 10, 100, 'm');
    const code = h('input', { class: 'nt-code', type: 'text', placeholder: 'Paste a share code to replay a run', spellcheck: false });
    const settings = h('div', { class: 'nt-settings' },
        h('h2', { class: 'nt-h', textContent: 'Difficulty' }), base.row, inc.row, phase.row,
        h('h2', { class: 'nt-h', textContent: 'Replay a run' }), code);

    // ---- status + actions ----
    const barFill = h('div');
    const bar = h('div', { class: 'nt-bar' }, barFill);
    const statusText = h('div');
    const cancelBtn = h('button', { type: 'button', class: 'nt-btn', textContent: 'Cancel', onclick: () => running?.abort() });
    const retryBtn = h('button', { type: 'button', class: 'nt-btn', textContent: 'Retry', onclick: () => void playSelected() });
    const actions = h('div', { class: 'nt-actions' }, cancelBtn, retryBtn);
    const status = h('div', { class: 'nt-status' });
    status.setAttribute('aria-live', 'polite');
    const playBtn = h('button', { type: 'button', class: 'nt-btn is-primary', textContent: 'Play', onclick: () => void playSelected() });

    const busy = () => running !== undefined;
    const show = (kind: 'idle' | 'loading' | 'error', message = '', progress?: LoadProgress) => {
        status.replaceChildren();
        if (kind === 'loading') {
            const v = describeProgress(progress);
            statusText.textContent = v.label;
            statusText.className = '';
            bar.classList.toggle('is-indeterminate', v.fraction === undefined);
            barFill.style.width = v.fraction === undefined ? '' : `${Math.round(v.fraction * 100)}%`;
            cancelBtn.hidden = false; retryBtn.hidden = true;
            status.append(bar, statusText, actions);
        } else if (kind === 'error') {
            statusText.textContent = message;
            statusText.className = 'nt-error';
            cancelBtn.hidden = true; retryBtn.hidden = !selectedId || lastWasSource === false;
            status.append(statusText, ...(retryBtn.hidden ? [] : [actions]));
        }
        playBtn.disabled = busy();
    };
    let lastWasSource = true;

    // ---- flow ----
    function begin(canonical: CanonicalDataset, palette: Palette | undefined) {
        const built = buildSettings({
            baseSpeed: parseFloat(base.input.value), speedInc: parseFloat(inc.input.value),
            phaseDist: parseFloat(phase.input.value), shareCode: code.value,
        }, canonical.contentHash);
        if (!built.ok) { lastWasSource = false; show('error', built.error); return; }
        if (destroyed) return;
        opts.onStart({ dataset: canonical.sentences, settings: built.settings, palette });
    }

    async function playSelected() {
        const src = sources.find(s => s.id === selectedId);
        if (!src || busy()) return;
        resumeAudio(); // browsers need a user gesture before audio may play
        lastWasSource = true;
        const ctl = new AbortController();
        running = ctl;
        show('loading');
        try {
            const res = await loadSource(src, cache, { signal: ctl.signal, onProgress: p => { if (!destroyed) show('loading', '', p); } });
            running = undefined;
            void refreshBadges();
            begin(res.canonical, src.palette);
        } catch (e) {
            running = undefined;
            if (destroyed) return;
            if (e instanceof SourceLoadError && e.kind === 'aborted') { show('idle'); return; }
            const msg = e instanceof SourceLoadError ? e.message : 'Could not load this dataset.';
            show('error', e instanceof SourceLoadError && e.kind === 'network' ? `${msg} Once a dataset has loaded, it works offline.` : msg);
        }
    }

    function readFile(file: File) {
        resumeAudio();
        lastWasSource = false;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const loaded = loadDatasetText(String(reader.result));
                begin(loaded.canonical, undefined);
            } catch (err) {
                show('error', err instanceof DatasetParseError ? err.message : 'Could not read this file.');
            }
        };
        reader.onerror = () => show('error', 'Could not read this file.');
        reader.readAsText(file);
    }

    const panel = h('div', { class: 'nt-panel' },
        h('h1', { class: 'nt-title', textContent: 'NER TOWER' }),
        h('p', { class: 'nt-tagline', textContent: 'Climb a tower built from text. Land on the entities that hold.' }),
        h('div', {}, h('h2', { class: 'nt-h', textContent: 'Choose a dataset' }), sourceList),
        dropZone, settings, status,
        h('div', { class: 'nt-actions' }, playBtn));
    overlay.append(panel);
    host.append(overlay);

    if (selectedId) select(selectedId); else playBtn.disabled = true;
    void refreshBadges();

    return {
        destroy() {
            destroyed = true;
            running?.abort();
            window.removeEventListener('resize', place);
            overlay.remove();
        },
    };
}
