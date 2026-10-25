import type { DatasetSource, LoadProgress } from '../data/sources/types';
import type { GameSettings } from '../config/settings';
import { decodeLegacyShareCode } from '../config/legacyShareCode';

/** Pure helpers behind the DOM menu, kept apart from the DOM so they can be unit tested. */

export interface ProgressView {
    label: string;
    /** 0..1, or undefined when the amount of work is not known (shows an indeterminate bar). */
    fraction: number | undefined;
}

export function describeProgress(p: LoadProgress | undefined): ProgressView {
    if (!p) return { label: 'Starting\u2026', fraction: undefined };
    switch (p.phase) {
        case 'discover': return { label: 'Contacting Hugging Face\u2026', fraction: undefined };
        case 'download': {
            const { loaded = 0, total = 0 } = p;
            return total > 0
                ? { label: `Downloading sentences ${loaded} / ${total}`, fraction: Math.min(1, loaded / total) }
                : { label: 'Downloading\u2026', fraction: undefined };
        }
        case 'parse': return { label: 'Preparing the tower\u2026', fraction: 1 };
        case 'done': return { label: 'Ready', fraction: 1 };
    }
}

export function sizeLabel(source: Pick<DatasetSource, 'expectedRows'>): string {
    const n = source.expectedRows;
    return n === undefined ? 'size unknown' : `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} sentences`;
}

export interface SettingsInput {
    baseSpeed: number;
    speedInc: number;
    phaseDist: number;
    /** Text of the share code box; empty means a fresh random seed. */
    shareCode: string;
}

export type BuiltSettings = { ok: true; settings: GameSettings } | { ok: false; error: string };

/** Short form of the content hash used in the prototype share code (until M4). */
export const shortHash = (contentHash: string) => contentHash.slice(0, 16);

/**
 * Settings for a run on a loaded dataset. A pasted share code overrides the sliders and the seed,
 * but must have been made for this exact dataset.
 */
export function buildSettings(input: SettingsInput, contentHash: string, randomSeed: () => number = () => Math.floor(Math.random() * 1_000_000)): BuiltSettings {
    const datasetHash = shortHash(contentHash);
    const code = input.shareCode.trim();
    if (code === '') {
        return { ok: true, settings: { datasetHash, seed: randomSeed(), baseSpeed: input.baseSpeed, speedInc: input.speedInc, phaseDist: input.phaseDist } };
    }
    const decoded = decodeLegacyShareCode(code);
    if (!decoded.ok) return decoded;
    if (decoded.settings.datasetHash !== datasetHash) return { ok: false, error: 'This share code was made for a different dataset.' };
    return decoded;
}
