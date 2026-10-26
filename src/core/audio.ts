import { zzfx, zzfxX } from './zzfx';
import { effectGain, getVolumes, scaleSound, type SoundPreset } from './volume';

/** The shared Web Audio context (sound effects and music play through it). */
export { zzfxX as audioContext };

/** Browsers suspend audio until a user gesture; call this from any input handler. */
export function resumeAudio(): void {
    if (zzfxX.state === 'suspended') void zzfxX.resume();
}

/** Plays a sound effect at the player's effects volume. */
export function playSound(preset: SoundPreset): void {
    const gain = effectGain(getVolumes().effects);
    if (gain > 0) zzfx(...scaleSound(preset, gain));
}

// Sound effect presets (ZzFX parameter arrays)
// Jump: a short chirp that RISES (about 190 to 690 Hz in 0.1 s). Land: a short thump that FALLS (about 190 to 60 Hz).
// (The first versions had these the other way round and with 0.6 s tails: a rising sweep on landing sounded like a jump.)
// Check the contours with `npm run music` (Sound effects row) or by rendering the preset: slide units are about 475 Hz/s per 1.0.
export const sndJump = [1.3,,240,.005,.03,.07,0,1,10];
export const sndLand = [1.6,,200,.002,.015,.08,2,1,-4,,,,,.05];
export const sndCombo = [2.0,,500,.01,.05,.2,1,1.5,15,50,,,,,,,,.7];
export const sndPhase = [1.5,,300,.1,.2,.3,3,1.5,-20,,,,,,,,,.5];
export const sndOver = [2.5,,100,.1,.5,1,4,2.5,-30,20,,,,.1,,,,.8];
