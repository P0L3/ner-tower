import { zzfxX } from './zzfx';

export { zzfx, zzfxX as audioContext } from './zzfx';

/** Browsers suspend audio until a user gesture; call this from any input handler. */
export function resumeAudio(): void {
    if (zzfxX.state === 'suspended') void zzfxX.resume();
}

// Sound effect presets (ZzFX parameter arrays)
export const sndJump = [1.2,,150,.01,.01,.08,1,1.1,-15,10,,,.02,,,,,,.5];
export const sndLand = [1.5,,80,.02,.01,.05,1,1.4,10,,,,,,,,,,.5];
export const sndCombo = [2.0,,500,.01,.05,.2,1,1.5,15,50,,,,,,,,.7];
export const sndPhase = [1.5,,300,.1,.2,.3,3,1.5,-20,,,,,,,,,.5];
export const sndOver = [2.5,,100,.1,.5,1,4,2.5,-30,20,,,,.1,,,,.8];
