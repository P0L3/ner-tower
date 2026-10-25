import { describe, it, expect } from 'vitest';
import { Composer, musicSeed, isAudible, midiToFreq, nearestChordTone, waveOfLabel, STEPS_PER_BAR, BARS_PER_PHRASE, type Bar } from './composer';
import { filterPlayable } from '../data/playable';
import { SAMPLE_SENTENCES } from '../data/fixtures/sample';
import { makeSyntheticDataset } from '../data/fixtures/synthetic';

const sample = filterPlayable(SAMPLE_SENTENCES);
const synthetic = filterPlayable(makeSyntheticDataset(300, 12, 4));
const bars = (c: Composer, n: number): Bar[] => Array.from({ length: n }, () => c.nextBar());

describe('musicSeed', () => {
    it('is a 32 bit integer that depends on dataset, content and seed', () => {
        const s = musicSeed('org/a', 'f'.repeat(16), 5);
        expect(Number.isInteger(s) && s >= 0 && s <= 0xffffffff).toBe(true);
        expect(new Set([s, musicSeed('org/b', 'f'.repeat(16), 5), musicSeed('org/a', '0'.repeat(16), 5), musicSeed('org/a', 'f'.repeat(16), 6)]).size).toBe(4);
    });
});

describe('Composer', () => {
    it('is deterministic: same dataset and seed give the same music', () => {
        expect(bars(new Composer(synthetic, 42), 40)).toEqual(bars(new Composer(synthetic, 42), 40));
    });
    it('different seeds give different music', () => {
        expect(bars(new Composer(synthetic, 1), 16)).not.toEqual(bars(new Composer(synthetic, 2), 16));
    });
    it('the seed decides key, mode and tempo within sane ranges', () => {
        const seen = new Set<string>();
        for (let seed = 0; seed < 60; seed++) {
            const c = new Composer(sample, seed);
            expect(c.root).toBeGreaterThanOrEqual(45); expect(c.root).toBeLessThanOrEqual(56);
            expect(c.baseBpm).toBeGreaterThanOrEqual(84); expect(c.baseBpm).toBeLessThanOrEqual(116);
            seen.add(c.modeName);
        }
        expect(seen.size).toBeGreaterThan(3);
    });
    it('bars are numbered from 0 and every note is well formed', () => {
        const c = new Composer(synthetic, 7);
        bars(c, 64).forEach((bar, i) => {
            expect(bar.index).toBe(i);
            for (const n of bar.notes) {
                expect(Number.isInteger(n.step) && n.step >= 0 && n.step < STEPS_PER_BAR).toBe(true);
                expect(n.length).toBeGreaterThanOrEqual(1);
                expect(n.midi).toBeGreaterThanOrEqual(30); expect(n.midi).toBeLessThanOrEqual(100);
                expect(n.velocity).toBeGreaterThan(0); expect(n.velocity).toBeLessThanOrEqual(1);
            }
            for (const s of [...bar.kick, ...bar.snare, ...bar.hat]) expect(s).toBeLessThan(STEPS_PER_BAR);
        });
    });
    it('a phrase is played twice: same drums and bass, and the melody answers in its second half', () => {
        const part = (b: Bar[], v: string) => b.map(x => [x.kick, x.snare, x.hat, x.notes.filter(n => n.voice === v)]);
        const leads = (b: Bar[]) => b.flatMap(x => x.notes.filter(n => n.voice === 'lead').map(n => n.midi));
        let answered = 0;
        for (let seed = 1; seed <= 20; seed++) {
            const all = bars(new Composer(synthetic, seed), BARS_PER_PHRASE * 2);
            const first = all.slice(0, BARS_PER_PHRASE), second = all.slice(BARS_PER_PHRASE);
            expect(part(second, 'bass')).toEqual(part(first, 'bass'));
            expect(leads(second).length).toBe(leads(first).length);
            if (JSON.stringify(leads(second)) !== JSON.stringify(leads(first))) answered++;
        }
        expect(answered).toBeGreaterThan(10);
    });
    it('lead notes carry labels from the dataset and the timbre of their label; other voices carry none', () => {
        const labels = new Set(synthetic.flatMap(s => s.ner.map(sp => sp[2])));
        let leads = 0;
        for (const bar of bars(new Composer(synthetic, 9), 80)) for (const n of bar.notes) {
            if (n.voice === 'lead') { leads++; expect(labels.has(n.label!)).toBe(true); expect(n.wave).toBe(waveOfLabel(n.label!)); }
            else expect(n.label).toBeUndefined();
        }
        expect(leads).toBeGreaterThan(20);
    });
    it('keeps every voice present, and bass and pad on every bar', () => {
        for (const bar of bars(new Composer(sample, 11), 24)) {
            expect(bar.notes.some(n => n.voice === 'bass')).toBe(true);
            expect(bar.notes.filter(n => n.voice === 'pad')).toHaveLength(3);
            expect(bar.kick.length).toBeGreaterThan(0);
        }
    });
    it('does not depend on how many bars were asked for before (endless, no hidden state from the caller)', () => {
        const a = new Composer(sample, 5), b = new Composer(sample, 5);
        const all = bars(a, 30);
        const parts = [...bars(b, 7), ...bars(b, 1), ...bars(b, 22)];
        expect(parts).toEqual(all);
    });
    it('refuses a dataset without a playable sentence', () => {
        expect(() => new Composer([], 1)).toThrow();
        expect(() => new Composer(SAMPLE_SENTENCES.filter(s => s.id === 'fx-4' || s.id === 'fx-11'), 1)).toThrow();
    });
    it('copes with punctuation-only and one-token sentences', () => {
        const odd = [{ text: '', tokenized_text: ['!', '?', '.'], ner: [[0, 0, 'X']] }, { text: '', tokenized_text: ['go'], ner: [[0, 0, 'Y']] }] as never;
        expect(bars(new Composer(odd, 1), 16).length).toBe(16);
    });
});

describe('helpers', () => {
    it('isAudible silences only the lead notes of unstable labels', () => {
        const unstable = new Set(['A']);
        expect(isAudible({ label: 'A' }, unstable)).toBe(false);
        expect(isAudible({ label: 'B' }, unstable)).toBe(true);
        expect(isAudible({ label: undefined }, unstable)).toBe(true);
    });
    it('midiToFreq matches concert pitch', () => {
        expect(midiToFreq(69)).toBeCloseTo(440);
        expect(midiToFreq(57)).toBeCloseTo(220);
    });
    it('nearestChordTone lands on root, third or fifth of the chord', () => {
        for (let chord = 0; chord < 7; chord++) for (let d = 5; d < 20; d++) {
            const rel = (((nearestChordTone(d, chord) - chord) % 7) + 7) % 7;
            expect([0, 2, 4]).toContain(rel);
        }
        expect(nearestChordTone(14, 0)).toBe(14);
    });
});
