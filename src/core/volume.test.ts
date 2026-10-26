import { describe, it, expect } from 'vitest';
import { loadVolumes, saveVolumes, clampVolume, effectGain, scaleSound, DEFAULT_VOLUMES, EFFECT_BASE } from './volume';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

describe('volumes', () => {
    it('default to music louder than effects', () => {
        expect(loadVolumes(mem())).toEqual(DEFAULT_VOLUMES);
        expect(DEFAULT_VOLUMES.music).toBeGreaterThan(DEFAULT_VOLUMES.effects);
    });
    it('round-trip, clamp, and survive junk or broken storage', () => {
        const s = mem();
        saveVolumes({ music: 0.25, effects: 1 }, s);
        expect(loadVolumes(s)).toEqual({ music: 0.25, effects: 1 });
        s.setItem('ner-tower:volume', JSON.stringify({ music: 9, effects: -3 }));
        expect(loadVolumes(s)).toEqual({ music: 1, effects: 0 });
        s.setItem('ner-tower:volume', '{nope');
        expect(loadVolumes(s)).toEqual(DEFAULT_VOLUMES);
        s.setItem('ner-tower:volume', JSON.stringify({ music: 'loud' }));
        expect(loadVolumes(s)).toEqual(DEFAULT_VOLUMES);
        const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
        expect(loadVolumes(broken)).toEqual(DEFAULT_VOLUMES);
        expect(() => saveVolumes(DEFAULT_VOLUMES, broken)).not.toThrow();
        expect(clampVolume(NaN, 0.4)).toBe(0.4);
    });
    it('effect gain is silent at 0 and at most EFFECT_BASE', () => {
        expect(effectGain(0)).toBe(0);
        expect(effectGain(1)).toBe(EFFECT_BASE);
        expect(effectGain(0.5)).toBe(EFFECT_BASE / 2);
    });
    it('scaleSound scales only the volume parameter and keeps holes as defaults', () => {
        const preset = [1.2, , 150, .01];
        const out = scaleSound(preset, 0.5);
        expect(out[0]).toBeCloseTo(0.6);
        expect(out[1]).toBeUndefined();
        expect(out.slice(2)).toEqual([150, .01]);
        expect(preset[0]).toBe(1.2);
        expect(scaleSound([undefined], 2)[0]).toBe(2);
    });
});
