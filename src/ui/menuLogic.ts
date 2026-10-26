import type { DatasetSource, LoadProgress } from '../data/sources/types';
import { LOCAL_DATASET_ID, randomSeed, shortContentHash, snapSetting, type GameSettings } from '../config/settings';
import { decodeShareCode } from '../config/shareCode';
import { weeklySettings } from '../config/weekly';
import { classicSettings, isClassicConfig } from '../config/classic';

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

/** Heading and detail line of a board, from its configuration. */
export function describeBoard(s: GameSettings, titleOf: (datasetId: string) => string | undefined): { title: string; subtitle: string } {
    const dataset = s.datasetId === LOCAL_DATASET_ID ? 'Your own file' : (titleOf(s.datasetId) ?? s.datasetId);
    return {
        title: s.weekly ? `Weekly ${s.weekly}: ${dataset}` : isClassicConfig(s) ? `Classic: ${dataset}` : dataset,
        subtitle: `seed ${s.seed}, speed ${s.baseSpeed} (+${s.speedInc}), phase ${s.phaseDist} m`,
    };
}

/** How a run is configured: from the sliders (and maybe a pasted share code), or the weekly challenge. */
export type StartMode =
    | { kind: 'custom'; baseSpeed: number; speedInc: number; phaseDist: number; shareCode: string }
    | { kind: 'weekly'; now: Date }
    /** `pinnedHash`: the short content hash the dataset's Classic board was created for (undefined = no Classic board). */
    | { kind: 'classic'; pinnedHash: string | undefined };

/** The dataset a run is about to be played on. `contentHash` is the full canonical hash. */
export interface DatasetRef { datasetId: string; contentHash: string }

export type BuiltSettings = { ok: true; settings: GameSettings } | { ok: false; error: string };

const nameOf = (datasetId: string) => (datasetId === LOCAL_DATASET_ID ? 'a dropped file' : datasetId);

/**
 * Settings for a run on a loaded dataset. Slider values are snapped to the allowed grid. A pasted
 * share code overrides sliders and seed, but must have been made for this exact data.
 */
export function buildSettings(mode: StartMode, dataset: DatasetRef, random: () => number = Math.random): BuiltSettings {
    const contentHash = shortContentHash(dataset.contentHash);
    if (mode.kind === 'classic') {
        if (dataset.datasetId === LOCAL_DATASET_ID) return { ok: false, error: 'The Classic challenge needs one of the listed datasets.' };
        if (mode.pinnedHash === undefined) return { ok: false, error: 'This dataset has no Classic challenge.' };
        if (mode.pinnedHash !== contentHash) {
            return { ok: false, error: 'This dataset has changed since its Classic board was created, so the Classic challenge is paused. Weekly and custom runs still work.' };
        }
        return { ok: true, settings: classicSettings(dataset.datasetId, contentHash) };
    }
    if (mode.kind === 'weekly') {
        if (dataset.datasetId === LOCAL_DATASET_ID) return { ok: false, error: 'The weekly challenge needs one of the listed datasets.' };
        return { ok: true, settings: weeklySettings(mode.now, dataset.datasetId, contentHash) };
    }
    if (mode.shareCode.trim() === '') {
        return {
            ok: true,
            settings: {
                datasetId: dataset.datasetId, contentHash, seed: randomSeed(random),
                baseSpeed: snapSetting('baseSpeed', mode.baseSpeed), speedInc: snapSetting('speedInc', mode.speedInc),
                phaseDist: snapSetting('phaseDist', mode.phaseDist),
            },
        };
    }
    const decoded = decodeShareCode(mode.shareCode);
    if (!decoded.ok) return { ok: false, error: decoded.error };
    const s = decoded.settings;
    if (s.datasetId !== dataset.datasetId) {
        return { ok: false, error: `This share code was made for ${nameOf(s.datasetId)}, not ${nameOf(dataset.datasetId)}.` };
    }
    if (s.contentHash !== contentHash) {
        return { ok: false, error: 'This share code was made for different data (the dataset changed, or this is another file).' };
    }
    return { ok: true, settings: s };
}
