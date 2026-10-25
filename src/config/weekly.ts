import { sha256Hex } from '../core/hash';
import { SETTING_RANGES, type GameSettings } from './settings';

/**
 * Weekly challenge: everyone gets the same seed for a given dataset and UTC ISO week, with fixed
 * settings. It needs no server: the week and the dataset id decide the seed, and the resulting
 * configuration has an ordinary board like any other (see board.ts).
 *
 * The seed derivation is part of what a weekly board means. Changing the tag below (or the
 * preset) gives other seeds for the same week, so `weekly.test.ts` pins golden values.
 */
const SEED_TAG = 'ner-tower-weekly-v1';

/** The fixed difficulty of every weekly challenge. */
export const WEEKLY_PRESET = {
    baseSpeed: SETTING_RANGES.baseSpeed.initial,
    speedInc: SETTING_RANGES.speedInc.initial,
    phaseDist: SETTING_RANGES.phaseDist.initial,
} as const;

export interface IsoWeek { year: number; week: number }

const DAY = 86_400_000;

/** ISO 8601 week of the UTC calendar date of `date` (weeks start on Monday; week 1 contains Jan 4th). */
export function isoWeekUtc(date: Date): IsoWeek {
    const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const weekday = new Date(day).getUTCDay() || 7;           // Mon=1 .. Sun=7
    const thursday = day + (4 - weekday) * DAY;               // the Thursday decides the ISO year
    const year = new Date(thursday).getUTCFullYear();
    const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY / 7) + 1;
    return { year, week };
}

export const weekLabel = ({ year, week }: IsoWeek): string => `${year}-W${String(week).padStart(2, '0')}`;

/** 32-bit seed for a week label ('2026-W43') and dataset id. */
export function weeklySeed(label: string, datasetId: string): number {
    return parseInt(sha256Hex(`${SEED_TAG}|${label}|${datasetId}`).slice(0, 8), 16);
}

/** The weekly configuration for a dataset, as of `now`. `contentHash` is the short form. */
export function weeklySettings(now: Date, datasetId: string, contentHash: string): GameSettings {
    const label = weekLabel(isoWeekUtc(now));
    return { datasetId, contentHash, seed: weeklySeed(label, datasetId), ...WEEKLY_PRESET, weekly: label };
}
