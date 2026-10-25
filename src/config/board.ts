import { sha256Hex } from '../core/hash';
import { RULESET_VERSION } from './ruleset';
import type { GameSettings } from './settings';

/**
 * Board identity. A board is "this exact configuration under this ruleset version", and its key
 * is a truncated SHA-256 of a canonical string, so the server never needs to understand it.
 *
 * Changing how the string is built (or `BOARD_KEY_VERSION`) re-keys every board, exactly like a
 * ruleset bump. `board.test.ts` pins a golden key to make that deliberate.
 */
export const BOARD_KEY_VERSION = 1;

const hundredths = (x: number) => Math.round(x * 100);

/** The fields of a configuration, normalized (speeds as whole hundredths), in fixed order. Shared with the share code. */
export function configFields(s: GameSettings, rulesetVersion: number = RULESET_VERSION): string[] {
    return [String(rulesetVersion), s.datasetId, s.contentHash, String(s.seed),
        String(hundredths(s.baseSpeed)), String(hundredths(s.speedInc)), String(s.phaseDist)];
}

export function boardConfigString(s: GameSettings, rulesetVersion: number = RULESET_VERSION): string {
    return [`ner-tower-board-v${BOARD_KEY_VERSION}`, ...configFields(s, rulesetVersion)].join('|');
}

/** 32 hex chars (128 bits). Ignores display-only fields such as `weekly`. */
export function boardKey(s: GameSettings, rulesetVersion: number = RULESET_VERSION): string {
    return sha256Hex(boardConfigString(s, rulesetVersion)).slice(0, 32);
}
