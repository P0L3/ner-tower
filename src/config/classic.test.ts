import { describe, it, expect } from 'vitest';
import { classicSeed, classicSettings, isClassicConfig, challengeName, CLASSIC_PRESET } from './classic';
import { settingsProblem, withNewSeed } from './settings';
import { boardKey } from './board';
import { weeklySettings } from './weekly';
import { encodeShareCode, decodeShareCode } from './shareCode';

const SILVER = 'P0L3/CliReNER_v_1_1_28_SILVER';
const GOLD = 'P0L3/CliReNER_v_1_1_28_GOLD';
const HASH = '0123456789abcdef';

describe('classic challenge', () => {
    it('GOLDEN: seeds and board key are fixed', () => {
        // If this fails you changed what every Classic board means. Change the tag in classic.ts only on purpose.
        expect(classicSeed(SILVER)).toBe(3563039092);
        expect(classicSeed(GOLD)).toBe(2038022711);
        expect(boardKey(classicSettings(SILVER, HASH))).toBe('171d488905f424aeb7220e9ea1cdb4b5');
        expect(CLASSIC_PRESET).toEqual({ baseSpeed: 0.5, speedInc: 0.15, phaseDist: 100 });
    });
    it('is a valid board configuration, the same every time, different per dataset', () => {
        const s = classicSettings(SILVER, HASH);
        expect(settingsProblem(s)).toBeUndefined();
        expect(classicSettings(SILVER, HASH)).toEqual(s);
        expect(classicSeed(SILVER)).not.toBe(classicSeed(GOLD));
    });
    it('does not depend on the date, and is not the weekly board', () => {
        const w = weeklySettings(new Date('2026-10-25T10:00:00Z'), SILVER, HASH);
        expect(boardKey(w)).not.toBe(boardKey(classicSettings(SILVER, HASH)));
    });
    it('a data change is another board (the pinned hash is part of the key)', () => {
        expect(boardKey(classicSettings(SILVER, HASH))).not.toBe(boardKey(classicSettings(SILVER, 'fedcba9876543210')));
    });
    it('survives a share code round trip and is recognized afterwards', () => {
        const back = decodeShareCode(encodeShareCode(classicSettings(SILVER, HASH)));
        expect(back.ok && isClassicConfig(back.settings)).toBe(true);
        expect(back.ok && boardKey(back.settings)).toBe(boardKey(classicSettings(SILVER, HASH)));
    });
    it('isClassicConfig and challengeName tell the challenges apart', () => {
        const c = classicSettings(SILVER, HASH);
        expect(isClassicConfig(c)).toBe(true);
        expect(isClassicConfig({ ...c, phaseDist: 110 })).toBe(false);
        expect(isClassicConfig(withNewSeed(c, 5))).toBe(false);
        expect(challengeName(c)).toBe('Classic challenge');
        expect(challengeName(weeklySettings(new Date('2026-10-25T10:00:00Z'), SILVER, HASH))).toBe('Weekly challenge 2026-W43');
        expect(challengeName(withNewSeed(c, 5))).toBeUndefined();
    });
});
