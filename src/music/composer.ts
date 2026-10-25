import { seededRandom } from '../core/rng';
import { hashString, sha256Hex } from '../core/hash';
import { isValidSpan } from '../data/playable';
import type { SentenceData } from '../data/types';

/**
 * Procedural background music, translated from the dataset. Pure and deterministic: no Web Audio,
 * no Phaser, no Math.random. Same dataset + same seed = same music, note for note.
 *
 * This is COSMETIC. It is not part of the ruleset (docs/RULESET.md): it has its own RNG stream
 * and never touches the tower generator, so tuning it never needs a RULESET_VERSION bump.
 *
 * How the data becomes music (see docs/MUSIC.md):
 *  - key, mode, tempo, chord progressions, drum patterns and WHICH sentences are played come from the seed;
 *  - a phrase (4 bars, played twice) is built from one real sentence of the dataset: each word
 *    becomes a note, its pitch walk and rhythm decided by the word itself (same word, same behaviour);
 *  - entity tokens play on the lead voice, tagged with their label. The player silences the lead
 *    notes of labels that turned unstable, so the tune loses voices exactly as the tower does;
 *  - plain words play as soft plucks, punctuation is a rest;
 *  - bass, pad and drums follow the chords and never depend on labels.
 *
 * The composer always renders the COMPLETE music. Which voices are audible is decided later
 * (`isAudible`), so what the composer draws from its RNG never depends on how the run goes.
 */

export const MUSIC_TAG = 'ner-tower-music-v1';
export const STEPS_PER_BAR = 16;            // sixteenth notes
export const BARS_PER_PHRASE = 4;
const SLOTS_PER_BAR = STEPS_PER_BAR / 2;    // melody moves in eighth notes
const SLOTS_PER_PHRASE = SLOTS_PER_BAR * BARS_PER_PHRASE;

export type Voice = 'lead' | 'pluck' | 'bass' | 'pad';
export type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth';

export interface MusicNote {
    /** Sixteenth-note position inside the bar, 0..15. */
    step: number;
    /** Length in sixteenth notes (may run past the end of the bar). */
    length: number;
    midi: number;
    /** 0..1 loudness before the mixer. */
    velocity: number;
    voice: Voice;
    wave: Wave;
    /** Entity label of a lead note. The note is silent while this label is unstable. */
    label?: string;
}

export interface Bar {
    index: number;
    notes: MusicNote[];
    /** Drum hits as sixteenth-note positions. The player decides which drums are active. */
    kick: number[];
    snare: number[];
    hat: number[];
}

/** Seed for the music of one run. Weekly runs and share-code replays share their music, like their tower. */
export function musicSeed(datasetId: string, contentHash: string, seed: number): number {
    return parseInt(sha256Hex(`${MUSIC_TAG}|${datasetId}|${contentHash}|${seed}`).slice(0, 8), 16);
}

export const midiToFreq = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** A lead note is audible unless its label is currently unstable. Everything else always plays. */
export const isAudible = (n: Pick<MusicNote, 'label'>, unstable: ReadonlySet<string>): boolean =>
    n.label === undefined || !unstable.has(n.label);

const MODES = [
    { name: 'ionian', steps: [0, 2, 4, 5, 7, 9, 11] },
    { name: 'dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
    { name: 'phrygian', steps: [0, 1, 3, 5, 7, 8, 10] },
    { name: 'lydian', steps: [0, 2, 4, 6, 7, 9, 11] },
    { name: 'mixolydian', steps: [0, 2, 4, 5, 7, 9, 10] },
    { name: 'aeolian', steps: [0, 2, 3, 5, 7, 8, 10] },
] as const;

/** Chord roots as scale degrees, one per bar. */
const PROGRESSIONS: readonly (readonly number[])[] = [
    [0, 5, 3, 4], [0, 3, 4, 0], [0, 4, 5, 3], [0, 2, 3, 4], [5, 3, 0, 4], [0, 5, 2, 4],
];
/** [step, chord-relative scale degree (0 root, 2 third, 4 fifth, 7 octave), length in steps] */
const BASS_PATTERNS: readonly (readonly (readonly [number, number, number])[])[] = [
    [[0, 0, 6], [8, 0, 6]],
    [[0, 0, 4], [6, 0, 2], [8, 4, 4], [14, 0, 2]],
    [[0, 0, 2], [4, 0, 2], [8, 0, 2], [12, 0, 2]],
    [[0, 0, 3], [3, 0, 3], [6, 4, 2], [8, 0, 3], [11, 0, 3], [14, 4, 2]],
];
const KICKS: readonly (readonly number[])[] = [[0, 8], [0, 6, 8], [0, 8, 10], [0, 4, 8, 12]];
const SNARES: readonly (readonly number[])[] = [[4, 12], [12]];
const HATS: readonly (readonly number[])[] = [[2, 6, 10, 14], [0, 2, 4, 6, 8, 10, 12, 14], [2, 4, 6, 10, 12, 14]];
const WAVES: readonly Wave[] = ['sine', 'triangle', 'square', 'sawtooth'];

const LEAD_MIN = 8, LEAD_MAX = 17, LEAD_START = 12;
const CHORD_TONES = [0, 2, 4] as const;

const h32 = (s: string): number => parseInt(hashString(s), 16);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const pick = <T>(rng: () => number, items: readonly T[]): T => items[Math.floor(rng() * items.length)];

/** The lead timbre of a label: the same label always sounds the same. */
export const waveOfLabel = (label: string): Wave => WAVES[h32(label) % WAVES.length];

/** Label per token, same rule as the tower layout: the span listed first wins, invalid spans are ignored. */
function labelsPerToken(s: SentenceData): (string | undefined)[] {
    const out = new Array<string | undefined>(s.tokenized_text.length).fill(undefined);
    for (const span of s.ner) {
        if (!isValidSpan(span, out.length)) continue;
        for (let i = span[0]; i <= span[1]; i++) if (out[i] === undefined) out[i] = span[2];
    }
    return out;
}

/** The scale degree closest to `degree` that is a tone of the chord rooted on `chordDegree`. */
export function nearestChordTone(degree: number, chordDegree: number): number {
    for (let d = 0; d <= 3; d++) {
        for (const x of d === 0 ? [degree] : [degree - d, degree + d]) {
            const rel = (((x - chordDegree) % 7) + 7) % 7;
            if (rel === 0 || rel === 2 || rel === 4) return x;
        }
    }
    return degree;
}

export class Composer {
    /** MIDI note of the tonic, mode name and base tempo (beats per minute), all from the seed. */
    readonly root: number;
    readonly modeName: string;
    readonly baseBpm: number;
    private readonly mode: readonly number[];
    private readonly rng: () => number;
    private readonly dataset: readonly SentenceData[];
    private readonly pool: number[] = [];
    private readonly queue: Bar[] = [];
    private barIndex = 0;

    constructor(dataset: readonly SentenceData[], seed: number) {
        this.dataset = dataset;
        this.rng = seededRandom(seed);
        dataset.forEach((s, i) => {
            if (Array.isArray(s?.tokenized_text) && Array.isArray(s?.ner)
                && s.ner.some(sp => Array.isArray(sp) && isValidSpan(sp, s.tokenized_text.length))) this.pool.push(i);
        });
        if (this.pool.length === 0) throw new Error('Composer needs at least one sentence with a valid entity');

        const m = pick(this.rng, MODES);
        this.modeName = m.name;
        this.mode = m.steps;
        this.root = 45 + Math.floor(this.rng() * 12);       // A2 .. G#3
        this.baseBpm = 84 + Math.floor(this.rng() * 33);    // 84 .. 116
    }

    /** MIDI note of a scale degree (0 = tonic, 7 = tonic an octave up, negative degrees go down). */
    scaleMidi(degree: number): number {
        const oct = Math.floor(degree / 7);
        return this.root + 12 * oct + this.mode[((degree % 7) + 7) % 7];
    }

    /** The music is endless: bars come one at a time, forever. */
    nextBar(): Bar {
        if (this.queue.length === 0) this.composePhrase();
        return this.queue.shift()!;
    }

    private composePhrase(): void {
        // Draw order is fixed here, so the music never depends on anything outside (dataset, seed).
        const prog = pick(this.rng, PROGRESSIONS);
        const sentence = this.dataset[pick(this.rng, this.pool)];
        const bass = pick(this.rng, BASS_PATTERNS);
        const kick = pick(this.rng, KICKS), snare = pick(this.rng, SNARES), hat = pick(this.rng, HATS);

        for (let round = 0; round < 2; round++) {   // the second time, the phrase answers itself two degrees higher
            const bars: Bar[] = Array.from({ length: BARS_PER_PHRASE }, () => ({
                index: this.barIndex++, notes: [], kick: [...kick], snare: [...snare], hat: [...hat],
            }));
            bars.forEach((bar, b) => {
                const chord = prog[b];
                for (const off of CHORD_TONES) {
                    bar.notes.push({ step: 0, length: STEPS_PER_BAR, midi: this.scaleMidi(7 + chord + off), velocity: 0.5, voice: 'pad', wave: 'sine' });
                }
                for (const [step, rel, length] of bass) {
                    bar.notes.push({ step, length, midi: this.scaleMidi(chord + rel), velocity: step === 0 ? 0.9 : 0.75, voice: 'bass', wave: 'sawtooth' });
                }
            });
            this.melody(sentence, prog, bars, round);
            this.queue.push(...bars);
        }
    }

    private melody(s: SentenceData, prog: readonly number[], bars: Bar[], round: number): void {
        const tokens = s.tokenized_text, labels = labelsPerToken(s);
        let pos = 0, t = 0, degree = LEAD_START, guard = 0;
        while (pos < SLOTS_PER_PHRASE && guard++ < SLOTS_PER_PHRASE * 4) {
            const i = t++ % tokens.length;                      // short sentences repeat as an ostinato
            const token = tokens[i], label = labels[i];
            if (!/[\p{L}\p{N}]/u.test(token)) { pos += 1; continue; }   // punctuation is a rest
            const h = h32(token.toLowerCase());
            const chars = Array.from(token).length;
            const slots = Math.min(chars <= 3 ? 1 : chars <= 7 ? 2 : 3, SLOTS_PER_PHRASE - pos);
            const b = Math.floor(pos / SLOTS_PER_BAR), step = (pos % SLOTS_PER_BAR) * 2, chord = prog[b];
            const strong = pos % 4 === 0;
            const answer = round === 1 && b >= 2 ? 2 : 0;

            if (label !== undefined) {
                degree = clamp(degree + (h % 5) - 2, LEAD_MIN, LEAD_MAX);
                const d = (strong ? nearestChordTone(degree, chord) : degree) + answer;
                bars[b].notes.push({ step, length: slots * 2, midi: this.scaleMidi(d), velocity: strong ? 0.9 : 0.7, voice: 'lead', wave: waveOfLabel(label), label });
            } else if ((h >>> 8) % 100 < 38) {
                const tone = CHORD_TONES[(h >>> 16) % 3];
                bars[b].notes.push({ step, length: Math.min(slots, 2) * 2, midi: this.scaleMidi(7 + chord + tone + answer), velocity: 0.45, voice: 'pluck', wave: 'triangle' });
            }
            pos += slots;
        }
    }
}
