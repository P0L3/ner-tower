import { describe, it, expect } from 'vitest';
import { isoWeekUtc, weekLabel, weeklySeed, weeklySettings, WEEKLY_PRESET } from './weekly';
import { settingsProblem } from './settings';
import { boardKey } from './board';

const label = (iso: string) => weekLabel(isoWeekUtc(new Date(iso)));
const SILVER = 'P0L3/CliReNER_v_1_1_28_SILVER';

describe('isoWeekUtc', () => {
    it('switches weeks at Monday 00:00 UTC', () => {
        expect(label('2026-10-25T23:59:59Z')).toBe('2026-W43'); // Sunday
        expect(label('2026-10-26T00:00:00Z')).toBe('2026-W44'); // Monday
    });
    it('handles the year boundaries of ISO weeks', () => {
        expect(label('2024-12-29T23:59:59Z')).toBe('2024-W52');
        expect(label('2024-12-30T00:00:00Z')).toBe('2025-W01'); // Dec 30 already belongs to next year's week 1
        expect(label('2021-01-03T12:00:00Z')).toBe('2020-W53'); // Jan 3 still belongs to last year's week 53
        expect(label('2021-01-04T00:00:00Z')).toBe('2021-W01');
        expect(label('2020-12-31T00:00:00Z')).toBe('2020-W53');
        expect(label('2026-01-01T00:00:00Z')).toBe('2026-W01');
    });
    it('uses the UTC date, not the local one', () => {
        // 23:30 on Sunday in UTC-5 is already Monday in UTC
        expect(label('2026-10-25T23:30:00-05:00')).toBe('2026-W44');
        expect(label('2026-10-26T00:30:00+05:00')).toBe('2026-W43');
    });
    it('pads the week number', () => { expect(weekLabel({ year: 2027, week: 3 })).toBe('2027-W03'); });
});

describe('weekly challenge', () => {
    it('GOLDEN: seeds for a given week and dataset are fixed', () => {
        // If this fails you changed what a weekly board means. Change the tag in weekly.ts on purpose instead.
        expect(weeklySeed('2026-W43', SILVER)).toBe(2509224134);
        expect(weeklySeed('2026-W44', SILVER)).toBe(3817573594);
    });
    it('differs per dataset and per week', () => {
        expect(weeklySeed('2026-W43', SILVER)).not.toBe(weeklySeed('2026-W43', 'P0L3/CliReNER_v_1_1_28_GOLD'));
        expect(weeklySeed('2026-W43', SILVER)).not.toBe(weeklySeed('2026-W44', SILVER));
    });
    it('is the same for everyone in the same week, at any time of it', () => {
        const a = weeklySettings(new Date('2026-10-19T00:00:00Z'), SILVER, '0123456789abcdef');
        const b = weeklySettings(new Date('2026-10-25T23:59:59Z'), SILVER, '0123456789abcdef');
        expect(b).toEqual(a);
        expect(a).toMatchObject({ ...WEEKLY_PRESET, seed: 2509224134, weekly: '2026-W43', datasetId: SILVER });
    });
    it('is a valid board configuration whose board key is that of the plain configuration', () => {
        const w = weeklySettings(new Date('2026-10-25T10:00:00Z'), SILVER, '0123456789abcdef');
        expect(settingsProblem(w)).toBeUndefined();
        const { weekly: _label, ...plain } = w;
        expect(boardKey(w)).toBe(boardKey(plain));
    });
    it('a different dataset content gives another board even in the same week', () => {
        const d = new Date('2026-10-25T10:00:00Z');
        expect(boardKey(weeklySettings(d, SILVER, '0123456789abcdef'))).not.toBe(boardKey(weeklySettings(d, SILVER, 'fedcba9876543210')));
    });
});
