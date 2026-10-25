import './menu.css';
import type { DatasetSource, LoadProgress } from '../data/sources/types';
import type { DatasetCache } from '../data/cache';
import type { CanonicalDataset } from '../data/canonical';
import type { SentenceData } from '../data/types';
import { LOCAL_DATASET_ID, SETTING_RANGES, type GameSettings, type SettingKey } from '../config/settings';
import { decodeShareCode } from '../config/shareCode';
import { isoWeekUtc, weekLabel } from '../config/weekly';
import type { Palette } from '../game/palette';
import { loadSource } from '../data/sources/cached';
import { SourceLoadError } from '../data/sources/errors';
import { loadDatasetText } from '../data/load';
import { DatasetParseError } from '../data/formats/index';
import { resumeAudio } from '../core/audio';
import { buildSettings, describeBoard, describeProgress, sizeLabel } from './menuLogic';
import { h } from './dom';
import { mountBoard, type BoardViewHandle } from './boardView';
import { boardKey } from '../config/board';
import { NICKNAME_MAX } from '../leaderboard/protocol';
import type { Leaderboard } from '../leaderboard/service';

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
    /** Absent in builds without a leaderboard URL: then nothing leaderboard related is shown. */
    leaderboard?: Leaderboard;
}

export interface MenuHandle { destroy(): void }

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function mountMenu(opts: MenuOptions): MenuHandle {
    const { canvas, sources, cache } = opts;
    const lb = opts.leaderboard;
    const host = canvas.parentElement ?? document.body;
    let destroyed = false;
    let selectedId = sources[0]?.id;
    let running: AbortController | undefined;
    let gated: HTMLButtonElement[] = [];
    const syncBusy = () => { for (const b of gated) b.disabled = running !== undefined; };
    let boardModal: { el: HTMLElement; handle: BoardViewHandle } | undefined;

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
        syncBusy();
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
    const slider = (label: string, key: SettingKey, suffix = '') => {
        const r = SETTING_RANGES[key];
        const out = h('output', { textContent: r.initial + suffix });
        const input = h('input', { type: 'range', min: String(r.min), max: String(r.max), step: String(r.step), value: String(r.initial), ariaLabel: label } as Partial<HTMLInputElement>);
        input.addEventListener('input', () => { out.textContent = input.value + suffix; });
        const set = (v: number) => { input.value = String(v); out.textContent = input.value + suffix; };
        return { input, set, row: h('label', { class: 'nt-row' }, h('span', { textContent: label }), input, out) };
    };
    const base = slider('Base speed', 'baseSpeed');
    const inc = slider('Speed inc', 'speedInc');
    const phase = slider('Phase dist', 'phaseDist', 'm');
    const code = h('input', { class: 'nt-code', type: 'text', placeholder: 'Paste a share code to replay a run', spellcheck: false });
    const hint = h('div', { class: 'nt-hint' });
    hint.setAttribute('aria-live', 'polite');
    const codeBoardBtn = h('button', { type: 'button', class: 'nt-link', textContent: 'View the leaderboard for this code', hidden: true, onclick: () => openCodeBoard() });
    const onCode = () => {
        hint.className = 'nt-hint';
        codeBoardBtn.hidden = true;
        if (code.value.trim() === '') { hint.textContent = ''; return; }
        const r = decodeShareCode(code.value);
        if (!r.ok) { hint.textContent = r.error; hint.classList.add('is-error'); return; }
        codeBoardBtn.hidden = lb === undefined;
        const s = r.settings;
        base.set(s.baseSpeed); inc.set(s.speedInc); phase.set(s.phaseDist);
        const src = sources.find(x => x.datasetId === s.datasetId);
        if (src) select(src.id);
        if (src) hint.textContent = `Replay of ${src.title}, seed ${s.seed}.`;
        else if (s.datasetId === LOCAL_DATASET_ID) hint.textContent = `Replay of a dropped file, seed ${s.seed}. Drop the same file to play it.`;
        else { hint.textContent = `This code is for ${s.datasetId}, which is not in this menu.`; hint.classList.add('is-error'); }
    };
    code.addEventListener('input', onCode);
    // Nickname for the leaderboards (only when this build has a leaderboard)
    const nick = h('input', { class: 'nt-code', type: 'text', maxLength: NICKNAME_MAX, placeholder: 'Your name on the leaderboards', spellcheck: false, value: lb?.player.nickname ?? '' });
    nick.setAttribute('aria-label', 'Nickname');
    const nickHint = h('div', { class: 'nt-hint' });
    const saveNickname = () => {
        if (!lb || nick.value.trim() === '') return;
        const saved = lb.player.setNickname(nick.value);
        nickHint.className = 'nt-hint' + (saved === undefined ? ' is-error' : '');
        if (saved === undefined) { nickHint.textContent = `Use 1 to ${NICKNAME_MAX} characters.`; return; }
        nick.value = saved;
        nickHint.textContent = 'Saved.';
        lb.promptDeclined = false;
        void lb.flush(); // sends scores that were waiting for a nickname
    };
    nick.addEventListener('change', saveNickname);
    nick.addEventListener('keydown', e => { if (e.key === 'Enter') saveNickname(); });
    const settings = h('div', { class: 'nt-settings' },
        ...(lb ? [h('h2', { class: 'nt-h', textContent: 'Your name' }), nick, nickHint] : []),
        h('h2', { class: 'nt-h', textContent: 'Difficulty' }), base.row, inc.row, phase.row,
        h('h2', { class: 'nt-h', textContent: 'Replay a run' }), code, hint, codeBoardBtn);

    // ---- status + actions ----
    const barFill = h('div');
    const bar = h('div', { class: 'nt-bar' }, barFill);
    const statusText = h('div');
    const cancelBtn = h('button', { type: 'button', class: 'nt-btn', textContent: 'Cancel', onclick: () => running?.abort() });
    let retry: () => void = () => {};
    const retryBtn = h('button', { type: 'button', class: 'nt-btn', textContent: 'Retry', onclick: () => retry() });
    const actions = h('div', { class: 'nt-actions' }, cancelBtn, retryBtn);
    const status = h('div', { class: 'nt-status' });
    status.setAttribute('aria-live', 'polite');
    const playBtn = h('button', { type: 'button', class: 'nt-btn is-primary', textContent: 'Play', onclick: () => void playSelected(false) });
    const weeklyBtn = h('button', { type: 'button', class: 'nt-btn', textContent: `Weekly challenge ${weekLabel(isoWeekUtc(new Date()))}`, onclick: () => void playSelected(true) });
    const weeklyBoardBtn = h('button', { type: 'button', class: 'nt-btn', textContent: 'Weekly leaderboard', onclick: () => void openWeeklyBoard() });
    gated = [playBtn, weeklyBtn, ...(lb ? [weeklyBoardBtn] : [])];

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
        syncBusy();
    };
    let lastWasSource = true;

    // ---- flow ----
    const fail = (message: string) => { lastWasSource = false; show('error', message); };

    function begin(canonical: CanonicalDataset, palette: Palette | undefined, src: DatasetSource | undefined, weekly: boolean) {
        const built = buildSettings(
            weekly ? { kind: 'weekly', now: new Date() }
                : { kind: 'custom', baseSpeed: parseFloat(base.input.value), speedInc: parseFloat(inc.input.value), phaseDist: parseFloat(phase.input.value), shareCode: code.value },
            { datasetId: src?.datasetId ?? LOCAL_DATASET_ID, contentHash: canonical.contentHash });
        if (!built.ok) { fail(built.error); return; }
        if (destroyed) return;
        opts.onStart({ dataset: canonical.sentences, settings: built.settings, palette });
    }

    /** Loads a source (cache first) with progress, cancel and retry. Resolves to undefined if it failed or was cancelled. */
    async function loadSelected(src: DatasetSource): Promise<CanonicalDataset | undefined> {
        resumeAudio(); // browsers need a user gesture before audio may play
        lastWasSource = true;
        const ctl = new AbortController();
        running = ctl;
        show('loading');
        try {
            const res = await loadSource(src, cache, { signal: ctl.signal, onProgress: p => { if (!destroyed) show('loading', '', p); } });
            running = undefined;
            void refreshBadges();
            if (!destroyed) show('idle');
            return res.canonical;
        } catch (e) {
            running = undefined;
            if (destroyed) return undefined;
            if (e instanceof SourceLoadError && e.kind === 'aborted') { show('idle'); return undefined; }
            const msg = e instanceof SourceLoadError ? e.message : 'Could not load this dataset.';
            show('error', e instanceof SourceLoadError && e.kind === 'network' ? `${msg} Once a dataset has loaded, it works offline.` : msg);
            return undefined;
        }
    }

    async function playSelected(weekly: boolean) {
        if (busy()) return;
        let src = sources.find(s => s.id === selectedId);
        if (!weekly && code.value.trim() !== '') {
            // A share code names its dataset: fail fast on a bad code, and load the dataset it belongs to.
            const r = decodeShareCode(code.value);
            if (!r.ok) { fail(r.error); return; }
            src = sources.find(s => s.datasetId === r.settings.datasetId);
            if (!src) {
                fail(r.settings.datasetId === LOCAL_DATASET_ID ? 'This code is for a dropped file. Drop that same file to replay it.' : `This code is for ${r.settings.datasetId}, which is not in this menu.`);
                return;
            }
            select(src.id);
        }
        if (!src) return;
        retry = () => void playSelected(weekly);
        const canonical = await loadSelected(src);
        if (canonical && !destroyed) begin(canonical, src.palette, src, weekly);
    }

    // ---- leaderboards ----
    function closeBoard() { boardModal?.handle.destroy(); boardModal?.el.remove(); boardModal = undefined; }

    function openBoard(s: GameSettings) {
        if (!lb) return;
        closeBoard();
        const { title, subtitle } = describeBoard(s, id => sources.find(x => x.datasetId === id)?.title);
        const body = h('div', { class: 'nt-modal-body' });
        const closeBtn = h('button', { type: 'button', class: 'nt-btn', textContent: 'Close', onclick: closeBoard });
        const el = h('div', { class: 'nt-modal' }, body, h('div', { class: 'nt-actions' }, closeBtn));
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.addEventListener('keydown', e => { if (e.key === 'Escape') closeBoard(); });
        overlay.append(el);
        boardModal = { el, handle: mountBoard(body, { leaderboard: lb, boardKey: boardKey(s), title, subtitle, limit: 10 }) };
        closeBtn.focus();
    }

    /** The weekly board needs the dataset's content hash, so the dataset is loaded first (instant when cached). */
    async function openWeeklyBoard() {
        const src = sources.find(s => s.id === selectedId);
        if (busy() || !lb || !src) return;
        retry = () => void openWeeklyBoard();
        const canonical = await loadSelected(src);
        if (!canonical || destroyed) return;
        const built = buildSettings({ kind: 'weekly', now: new Date() }, { datasetId: src.datasetId, contentHash: canonical.contentHash });
        if (built.ok) openBoard(built.settings);
    }

    function openCodeBoard() {
        const r = decodeShareCode(code.value);
        if (r.ok) openBoard(r.settings);
    }

    function readFile(file: File) {
        resumeAudio();
        lastWasSource = false;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const loaded = loadDatasetText(String(reader.result));
                begin(loaded.canonical, undefined, undefined, false);
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
        h('div', { class: 'nt-actions' }, playBtn, weeklyBtn),
        ...(lb ? [h('div', { class: 'nt-actions' }, weeklyBoardBtn)] : []));
    overlay.append(panel);
    host.append(overlay);

    if (selectedId) select(selectedId); else playBtn.disabled = true;
    void refreshBadges();
    if (lb && lb.player.nickname !== undefined) void lb.flush(); // retry scores that could not be sent earlier

    return {
        destroy() {
            destroyed = true;
            running?.abort();
            closeBoard();
            window.removeEventListener('resize', place);
            overlay.remove();
        },
    };
}
