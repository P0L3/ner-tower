import { describe, it, expect } from 'vitest';
import { boardKey, boardConfigString, BOARD_KEY_VERSION } from './board';
import { encodeShareCode, decodeShareCode } from './shareCode';
import { RULESET_VERSION } from './ruleset';
import type { GameSettings } from './settings';

const s: GameSettings = { datasetId: 'P0L3/CliReNER_v_1_1_28_SILVER', contentHash: '0123456789abcdef', seed: 482913, baseSpeed: 0.5, speedInc: 0.15, phaseDist: 100 };

describe('board key', () => {
    it('GOLDEN: the canonical string and key of version 1 are fixed', () => {
        // If this fails you changed which board a configuration belongs to. Bump BOARD_KEY_VERSION on purpose.
        expect(BOARD_KEY_VERSION).toBe(1);
        expect(boardConfigString(s)).toBe('ner-tower-board-v1|1|P0L3/CliReNER_v_1_1_28_SILVER|0123456789abcdef|482913|50|15|100');
        expect(boardKey(s)).toBe('4e42bb7189ea3b85169e7f16c45ab49a');
    });
    it('is 32 hex chars and stable', () => {
        expect(boardKey(s)).toMatch(/^[0-9a-f]{32}$/);
        expect(boardKey({ ...s })).toBe(boardKey(s));
    });
    it('changes with every field that defines a run, including the ruleset version', () => {
        const keys = new Set([
            boardKey(s), boardKey(s, RULESET_VERSION + 1),
            boardKey({ ...s, datasetId: 'P0L3/CliReNER_v_1_1_28_GOLD' }), boardKey({ ...s, contentHash: 'fedcba9876543210' }),
            boardKey({ ...s, seed: 482914 }), boardKey({ ...s, baseSpeed: 0.6 }), boardKey({ ...s, speedInc: 0.2 }), boardKey({ ...s, phaseDist: 110 }),
        ]);
        expect(keys.size).toBe(8);
    });
    it('ignores the weekly label: a weekly run and the same configuration share a board', () => {
        expect(boardKey({ ...s, weekly: '2026-W43' })).toBe(boardKey(s));
    });
    it('is the same on both ends of a share code', () => {
        const back = decodeShareCode(encodeShareCode(s));
        expect(back.ok && boardKey(back.settings)).toBe(boardKey(s));
    });
});
