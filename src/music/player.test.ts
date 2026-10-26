import { describe, it, expect, vi, afterEach } from 'vitest';
import { MusicPlayer } from './player';
import { Composer } from './composer';
import { loadMusicEnabled, saveMusicEnabled } from './prefs';
import { filterPlayable } from '../data/playable';
import { makeSyntheticDataset } from '../data/fixtures/synthetic';

/** Any Web Audio node: every property is a function returning another node, connect() returns its target. */
const node = (): any => new Proxy(function () {}, {
    get: (_t, k) => (k === 'connect' ? (x: unknown) => x : k === 'then' ? undefined : node()),
    apply: () => node(),
    set: () => true,
});

function fakeContext() {
    const made = { oscillators: 0, sources: 0 };
    const ctx = {
        currentTime: 0, sampleRate: 8000, state: 'running', destination: node(),
        createOscillator: () => { made.oscillators++; return node(); },
        createBufferSource: () => { made.sources++; return node(); },
        createGain: node, createBiquadFilter: node, createDynamicsCompressor: node,
        createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    };
    return { ctx: ctx as unknown as AudioContext, raw: ctx, made };
}

const data = filterPlayable(makeSyntheticDataset(100, 6, 2));
afterEach(() => { vi.useRealTimers(); });

describe('MusicPlayer', () => {
    it('schedules notes ahead of the audio clock while running, and nothing once stopped', () => {
        vi.useFakeTimers();
        const { ctx, raw, made } = fakeContext();
        const p = new MusicPlayer(ctx, new Composer(data, 1));
        p.start();
        const first = made.oscillators;
        expect(first).toBeGreaterThan(0);
        for (let i = 0; i < 20; i++) { raw.currentTime += 0.1; vi.advanceTimersByTime(100); }
        expect(made.oscillators).toBeGreaterThan(first);
        p.stop(0.1);
        const after = made.oscillators;
        for (let i = 0; i < 20; i++) { raw.currentTime += 0.1; vi.advanceTimersByTime(100); }
        expect(made.oscillators).toBe(after);
    });

    it('is silent while muted, and the music resumes afterwards', () => {
        vi.useFakeTimers();
        const { ctx, raw, made } = fakeContext();
        const p = new MusicPlayer(ctx, new Composer(data, 1), { enabled: false });
        p.start();
        for (let i = 0; i < 20; i++) { raw.currentTime += 0.1; vi.advanceTimersByTime(100); }
        expect(made.oscillators).toBe(0);
        p.setEnabled(true);
        for (let i = 0; i < 20; i++) { raw.currentTime += 0.1; vi.advanceTimersByTime(100); }
        expect(made.oscillators).toBeGreaterThan(0);
        p.stop(0.1);
    });

    it('drums build up with the phase: hats and snares are noise sources', () => {
        const run = (phase: number) => {
            vi.useFakeTimers();
            const { ctx, raw, made } = fakeContext();
            const p = new MusicPlayer(ctx, new Composer(data, 1));
            p.setPhase(phase, new Set());
            p.start();
            for (let i = 0; i < 60; i++) { raw.currentTime += 0.1; vi.advanceTimersByTime(100); }
            p.stop(0.1);
            vi.useRealTimers();
            return made.sources;
        };
        expect(run(0)).toBe(0);
        expect(run(3)).toBeGreaterThan(0);
    });

    it('takes a volume at construction and while running, clamped, without disturbing the schedule', () => {
        vi.useFakeTimers();
        const { ctx, raw, made } = fakeContext();
        const p = new MusicPlayer(ctx, new Composer(data, 1), { volume: 7 });
        p.setVolume(-1);                       // before start: just remembered
        p.start();
        p.setVolume(0.3);
        for (let i = 0; i < 10; i++) { raw.currentTime += 0.1; vi.advanceTimersByTime(100); }
        expect(made.oscillators).toBeGreaterThan(0);
        p.stop(0.1);
    });

    it('start is idempotent', () => {
        vi.useFakeTimers();
        const { ctx, made } = fakeContext();
        const p = new MusicPlayer(ctx, new Composer(data, 1));
        p.start(); const n = made.oscillators; p.start();
        expect(made.oscillators).toBe(n);
        p.stop(0.1);
    });
});

describe('music preference', () => {
    const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
    it('defaults to on, remembers off, and survives broken storage', () => {
        const s = mem();
        expect(loadMusicEnabled(s)).toBe(true);
        saveMusicEnabled(false, s);
        expect(loadMusicEnabled(s)).toBe(false);
        saveMusicEnabled(true, s);
        expect(loadMusicEnabled(s)).toBe(true);
        const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
        expect(loadMusicEnabled(broken)).toBe(true);
        expect(() => saveMusicEnabled(false, broken)).not.toThrow();
        expect(loadMusicEnabled(undefined)).toBe(true);
    });
});
