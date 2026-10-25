import { seededRandom } from '../core/rng';
import { STEPS_PER_BAR, isAudible, midiToFreq, type Bar, type Composer, type MusicNote, type Voice } from './composer';

/** Loudness of each part. Tune the mix here; the sound effects (core/audio.ts) play at 0.3 on top of it. */
export const MIX = { master: 0.5, lead: 0.16, pluck: 0.09, bass: 0.26, pad: 0.07, drums: 1 } as const;

/** Tempo rises with the phase, like the scroll speed does. */
export const TEMPO = { perPhase: 0.015, maxPhases: 20 } as const;

const LOOKAHEAD_S = 0.4;    // how far ahead notes are handed to the audio clock
const INTERVAL_MS = 100;    // how often the scheduler wakes up

/** attack / sustain level (fraction of velocity at the end of the note) / release, in seconds. */
const ENVELOPE: Record<Voice, { attack: number; sustain: number; release: number; hold: number }> = {
    lead:  { attack: 0.01,  sustain: 0.6,  release: 0.12, hold: 0.92 },
    pluck: { attack: 0.004, sustain: 0.05, release: 0.15, hold: 0.7 },
    bass:  { attack: 0.01,  sustain: 0.8,  release: 0.1,  hold: 0.95 },
    pad:   { attack: 0.35,  sustain: 1,    release: 0.5,  hold: 1 },
};

/**
 * Plays a Composer through Web Audio with a look-ahead scheduler (notes are queued on the audio
 * clock slightly early, so timers jittering never makes the music stutter).
 *
 * Voices follow the game: lead notes of unstable labels are silent, drums build up with the phase,
 * the tempo rises. None of this changes what the composer produces.
 */
export class MusicPlayer {
    private readonly ctx: AudioContext;
    private readonly composer: Composer;
    private enabled: boolean;
    private running = false;
    private timer: ReturnType<typeof setInterval> | undefined;

    private master!: GainNode;
    private buses = {} as Record<Voice | 'drums', GainNode>;
    private noise: AudioBuffer | undefined;

    private bar: Bar | undefined;
    private byStep: MusicNote[][] = [];
    private step = STEPS_PER_BAR;   // forces a bar to be loaded first
    private nextTime = 0;
    private phase = 0;
    private unstable: ReadonlySet<string> = new Set();

    constructor(ctx: AudioContext, composer: Composer, options: { enabled?: boolean } = {}) {
        this.ctx = ctx;
        this.composer = composer;
        this.enabled = options.enabled ?? true;
    }

    get isEnabled(): boolean { return this.enabled; }

    start(): void {
        if (this.running) return;
        this.running = true;
        const ctx = this.ctx;
        const compressor = ctx.createDynamicsCompressor();
        compressor.connect(ctx.destination);
        this.master = ctx.createGain();
        this.master.gain.setValueAtTime(0.0001, ctx.currentTime);
        this.master.gain.linearRampToValueAtTime(MIX.master, ctx.currentTime + 0.8);   // fade in
        this.master.connect(compressor);

        for (const name of ['lead', 'pluck', 'bass', 'pad', 'drums'] as const) {
            const bus = ctx.createGain();
            bus.gain.value = MIX[name];
            if (name === 'bass') {      // a saw through a low-pass: warm, and still audible on small speakers
                const lp = ctx.createBiquadFilter();
                lp.type = 'lowpass'; lp.frequency.value = 700;
                bus.connect(lp); lp.connect(this.master);
            } else bus.connect(this.master);
            this.buses[name] = bus;
        }

        const rng = seededRandom(1);   // noise for hats and snares: deterministic like everything else
        const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = rng() * 2 - 1;
        this.noise = noise;

        this.nextTime = ctx.currentTime + 0.15;
        this.tick();
        this.timer = setInterval(() => this.tick(), INTERVAL_MS);
    }

    /** Called by the game when the phase changes. `unstable` may be the game's own live set. */
    setPhase(phase: number, unstable: ReadonlySet<string>): void {
        this.phase = phase;
        this.unstable = unstable;
    }

    /** Muting keeps the timeline running, so the music comes back in time. */
    setEnabled(on: boolean): void { this.enabled = on; }

    stop(fadeSeconds = 0.4): void {
        if (!this.running) return;
        this.running = false;
        if (this.timer !== undefined) clearInterval(this.timer);
        this.timer = undefined;
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setTargetAtTime(0, now, fadeSeconds / 3);
        const master = this.master;
        setTimeout(() => master.disconnect(), fadeSeconds * 1000 + 300);
    }

    private get stepSeconds(): number {
        const bpm = this.composer.baseBpm * (1 + TEMPO.perPhase * Math.min(this.phase, TEMPO.maxPhases));
        return 60 / bpm / 4;
    }

    private tick(): void {
        if (!this.running) return;
        const now = this.ctx.currentTime;
        if (this.nextTime < now) this.nextTime = now + 0.05;   // came back from a stall: do not replay what was missed
        while (this.nextTime < now + LOOKAHEAD_S) {
            this.scheduleStep(this.nextTime);
            this.nextTime += this.stepSeconds;
        }
    }

    private scheduleStep(t: number): void {
        if (this.step >= STEPS_PER_BAR) this.loadBar();
        if (this.enabled && this.bar) {
            for (const n of this.byStep[this.step]) if (isAudible(n, this.unstable)) this.playNote(n, t);
            this.playDrums(this.bar, this.step, t);
        }
        this.step++;
    }

    private loadBar(): void {
        this.bar = this.composer.nextBar();
        this.step = 0;
        this.byStep = Array.from({ length: STEPS_PER_BAR }, () => [] as MusicNote[]);
        for (const n of this.bar.notes) this.byStep[n.step].push(n);
    }

    private playNote(n: MusicNote, t: number): void {
        const ctx = this.ctx, e = ENVELOPE[n.voice];
        const dur = n.length * this.stepSeconds * e.hold;
        const osc = ctx.createOscillator();
        osc.type = n.wave;
        osc.frequency.setValueAtTime(midiToFreq(n.midi), t);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(n.velocity, t + e.attack);
        g.gain.linearRampToValueAtTime(Math.max(0.0001, n.velocity * e.sustain), t + Math.max(dur, e.attack + 0.01));
        g.gain.linearRampToValueAtTime(0.0001, t + Math.max(dur, e.attack + 0.01) + e.release);
        osc.connect(g); g.connect(this.buses[n.voice]);
        osc.start(t);
        osc.stop(t + Math.max(dur, e.attack + 0.01) + e.release + 0.05);
        osc.onended = () => { osc.disconnect(); g.disconnect(); };
    }

    /** Drums build up as the player climbs: kick from the start, hats from phase 1, snare from phase 2. */
    private playDrums(bar: Bar, step: number, t: number): void {
        if (bar.kick.includes(step)) this.kick(t, this.phase === 0 ? 0.6 : 0.9);
        if (this.phase >= 1 && bar.hat.includes(step)) this.noiseHit(t, 'highpass', 7000, 0.04, 0.35);
        if (this.phase >= 2 && bar.snare.includes(step)) this.noiseHit(t, 'bandpass', 1800, 0.12, 0.6);
    }

    private kick(t: number, vol: number): void {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(g); g.connect(this.buses.drums);
        osc.start(t); osc.stop(t + 0.25);
        osc.onended = () => { osc.disconnect(); g.disconnect(); };
    }

    private noiseHit(t: number, filterType: BiquadFilterType, freq: number, dur: number, vol: number): void {
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = this.noise!;
        const f = ctx.createBiquadFilter();
        f.type = filterType; f.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(f); f.connect(g); g.connect(this.buses.drums);
        src.start(t); src.stop(t + dur + 0.02);
        src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
    }
}
