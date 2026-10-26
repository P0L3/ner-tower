/**
 * Stand-alone listening booth for the background music. No Phaser, no game: it feeds the real
 * Composer and MusicPlayer from src/music. Start it with `npm run music`.
 */
import { Composer, musicSeed } from '../src/music/composer';
import { MusicPlayer, TEMPO } from '../src/music/player';
import { filterPlayable } from '../src/data/playable';
import { profileEntities } from '../src/data/profile';
import { unstableLabelsAt } from '../src/game/phases';
import { SAMPLE_SENTENCES } from '../src/data/fixtures/sample';
import { makeSyntheticDataset } from '../src/data/fixtures/synthetic';
import { SOURCES } from '../src/data/sources/index';
import { loadSource } from '../src/data/sources/cached';
import { createDefaultCache } from '../src/data/cache';
import { loadDatasetText } from '../src/data/load';
import { randomSeed } from '../src/config/settings';
import { audioContext, playSound, sndJump, sndLand, sndCombo, sndPhase, sndOver } from '../src/core/audio';
import { getVolumes, setVolumes } from '../src/core/volume';
import type { SentenceData } from '../src/data/types';

interface Loaded { id: string; hash: string; sentences: SentenceData[] }

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SYNTHETIC = 'synthetic', SAMPLE = 'sample', FILE = 'file';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...kids);
    return e;
};
const row = (label: string, ...kids: Node[]) => el('div', { className: 'row' }, el('label', { textContent: label }), ...kids);

const cache = createDefaultCache();
const ctx = audioContext;   // the game's own context, shared with the sound effects
let player: MusicPlayer | undefined;
let loaded: Loaded = { id: SYNTHETIC, hash: SYNTHETIC, sentences: filterPlayable(makeSyntheticDataset(300, 12, 4)) };
let order: string[] = [];

// ---- controls ----
const datasetSel = el('select', {},
    el('option', { value: SYNTHETIC, textContent: 'Synthetic (12 labels)' }),
    el('option', { value: SAMPLE, textContent: 'Sample fixture (small)' }),
    ...SOURCES.map(s => el('option', { value: s.id, textContent: `${s.title} (downloads once, then cached)` })),
    el('option', { value: FILE, textContent: 'Your own file...' }));
const fileInput = el('input', { type: 'file', accept: '.json,.jsonl,.txt,.conll,.bio', hidden: true });
const seedInput = el('input', { type: 'number', value: String(randomSeed()), min: '0', max: '4294967295' });
const newSeedBtn = el('button', { textContent: 'New seed', onclick: () => { seedInput.value = String(randomSeed()); restart(); } });
const phaseInput = el('input', { type: 'range', min: '0', max: '0', step: '1', value: '0' });
const phaseOut = el('output', { textContent: '0' });
const enabledBox = el('input', { type: 'checkbox', checked: true });
const playBtn = el('button', { className: 'primary', textContent: 'Play', onclick: () => void toggle() });
const info = el('div', { id: 'info' });
const labelsBox = el('div', { id: 'labels' });
const status = el('div', { id: 'status' });

document.getElementById('app')!.append(
    row('Dataset', datasetSel, fileInput),
    row('Seed', seedInput, newSeedBtn),
    row('Phase', phaseInput, phaseOut),
    row('Sound', enabledBox, el('span', { textContent: 'audible (off = muted, timeline keeps running)' })),
    el('div', { className: 'row' }, playBtn),
    row('Effects', ...effectButtons(), effectsVolume()),
    status, info,
    el('div', {}, 'Labels (struck through = unstable at this phase, their lead notes are silent):', labelsBox));

// ---- sound effects: the same presets and volume as in the game ----
function effectButtons(): HTMLElement[] {
    const presets: [string, readonly (number | undefined)[]][] = [['Jump', sndJump], ['Land', sndLand], ['Super jump', sndCombo], ['Phase', sndPhase], ['Game over', sndOver]];
    return presets.map(([name, preset]) => el('button', { textContent: name, onclick: () => { void ctx.resume(); playSound(preset); } }));
}
function effectsVolume(): HTMLElement {
    const out = el('output', { textContent: `${Math.round(getVolumes().effects * 100)}%` });
    const input = el('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(getVolumes().effects * 100)) });
    input.addEventListener('input', () => { out.textContent = `${input.value}%`; setVolumes({ effects: Number(input.value) / 100 }); });
    return el('span', {}, input, ' ', out);
}

// ---- logic ----
function seed(): number { const n = Number(seedInput.value); return Number.isInteger(n) && n >= 0 ? n : 0; }

function unstableSet(): Set<string> { return new Set(unstableLabelsAt(Number(phaseInput.value), order)); }

function applyPhase() {
    const phase = Number(phaseInput.value);
    phaseOut.textContent = String(phase);
    const unstable = unstableSet();
    labelsBox.replaceChildren(...order.map(l => el('span', { className: unstable.has(l) ? 'off' : '', textContent: l })));
    player?.setPhase(phase, unstable);
    describe();
}

let composer: Composer | undefined;
function describe() {
    if (!composer) return;
    const phase = Number(phaseInput.value);
    const bpm = composer.baseBpm * (1 + TEMPO.perPhase * Math.min(phase, TEMPO.maxPhases));
    info.textContent = `${NOTE_NAMES[composer.root % 12]} ${composer.modeName}, ${Math.round(bpm)} bpm (base ${composer.baseBpm})\n` +
        `${loaded.sentences.length} sentences, ${order.length} labels, seed ${seed()}\n` +
        `drums: kick${phase >= 1 ? ', hats' : ''}${phase >= 2 ? ', snare' : ''}`;
}

function restart() {
    const wasPlaying = player !== undefined;
    player?.stop(0.2);
    player = undefined;
    order = profileEntities(loaded.sentences).map(s => s.label);
    phaseInput.max = String(Math.max(0, order.length - 1));
    if (Number(phaseInput.value) > Number(phaseInput.max)) phaseInput.value = phaseInput.max;
    composer = new Composer(loaded.sentences, musicSeed(loaded.id, loaded.hash, seed()));
    applyPhase();
    if (wasPlaying) start();
}

function start() {
    void ctx.resume();
    player = new MusicPlayer(ctx, composer!, { enabled: enabledBox.checked });
    player.setPhase(Number(phaseInput.value), unstableSet());
    player.start();
    playBtn.textContent = 'Stop';
}

async function toggle() {
    if (player) { player.stop(0.3); player = undefined; playBtn.textContent = 'Play'; return; }
    await ctx.resume();
    start();
}

async function selectDataset() {
    const v = datasetSel.value;
    fileInput.hidden = v !== FILE;
    status.textContent = '';
    try {
        if (v === SYNTHETIC) loaded = { id: SYNTHETIC, hash: SYNTHETIC, sentences: filterPlayable(makeSyntheticDataset(300, 12, 4)) };
        else if (v === SAMPLE) loaded = { id: SAMPLE, hash: SAMPLE, sentences: filterPlayable(SAMPLE_SENTENCES) };
        else if (v === FILE) { fileInput.click(); return; }
        else {
            const src = SOURCES.find(s => s.id === v)!;
            playBtn.disabled = true;
            status.textContent = `Loading ${src.title}...`;
            const res = await loadSource(src, cache, { onProgress: p => { if (p.phase === 'download') status.textContent = `Loading ${src.title}: ${p.loaded}/${p.total}`; } });
            loaded = { id: src.datasetId, hash: res.canonical.contentHash.slice(0, 16), sentences: res.canonical.sentences };
            status.textContent = '';
        }
    } catch (e) {
        status.textContent = e instanceof Error ? e.message : 'Could not load this dataset.';
        return;
    } finally { playBtn.disabled = false; }
    restart();
}

datasetSel.addEventListener('change', () => void selectDataset());
fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
        const { canonical } = loadDatasetText(await f.text());
        loaded = { id: 'local:file', hash: canonical.contentHash.slice(0, 16), sentences: canonical.sentences };
        status.textContent = '';
        restart();
    } catch (e) { status.textContent = e instanceof Error ? e.message : 'Could not read this file.'; }
});
seedInput.addEventListener('change', restart);
phaseInput.addEventListener('input', applyPhase);
enabledBox.addEventListener('change', () => player?.setEnabled(enabledBox.checked));

restart();
