import { describe, it, expect } from 'vitest';
import { RULESET_VERSION } from './ruleset';
import { RULESET_LOCK, CANONICAL_LOCK } from './ruleset.lock';
import { CANONICAL_VERSION } from '../data/canonical';
import { rulesetFingerprint, canonicalFingerprint } from '../game/rulesetFingerprint';

const versionsOf = (lock: Readonly<Record<number, string>>) => Object.keys(lock).map(Number).sort((a, b) => a - b);

function mismatch(what: string, versionConst: string, lockFile: string, version: number, actual: string): string {
    return [
        `The ${what} changed, but ${versionConst} is still ${version}.`,
        `Existing seeds and leaderboard boards would silently change meaning.`,
        ``,
        `If the change is intended (see docs/RULESET.md):`,
        `  1. increment ${versionConst} to ${version + 1}`,
        `  2. add  ${version + 1}: '${actual}'  to ${lockFile}`,
        `  3. leave the old entries untouched`,
        `If it is NOT intended, revert the change.`,
    ].join('\n');
}

describe('ruleset lock', () => {
    it('the gameplay rules match the fingerprint pinned for RULESET_VERSION', () => {
        const actual = rulesetFingerprint();
        const locked = RULESET_LOCK[RULESET_VERSION];
        expect(locked, `No entry for RULESET_VERSION ${RULESET_VERSION} in ruleset.lock.ts (current fingerprint: ${actual})`).toBeDefined();
        expect(actual, mismatch('gameplay rules', 'RULESET_VERSION', 'src/config/ruleset.lock.ts', RULESET_VERSION, actual)).toBe(locked);
    });

    it('has exactly one entry per version 1..RULESET_VERSION', () => {
        expect(RULESET_VERSION).toBeGreaterThanOrEqual(1);
        expect(versionsOf(RULESET_LOCK)).toEqual(Array.from({ length: RULESET_VERSION }, (_, i) => i + 1));
    });
});

describe('canonical lock', () => {
    it('the dataset normalization rules match the fingerprint pinned for CANONICAL_VERSION', () => {
        const actual = canonicalFingerprint();
        const locked = CANONICAL_LOCK[CANONICAL_VERSION];
        expect(locked, `No entry for CANONICAL_VERSION ${CANONICAL_VERSION} in ruleset.lock.ts (current fingerprint: ${actual})`).toBeDefined();
        expect(actual, mismatch('dataset normalization rules', 'CANONICAL_VERSION', 'src/config/ruleset.lock.ts (CANONICAL_LOCK)', CANONICAL_VERSION, actual)).toBe(locked);
    });

    it('has exactly one entry per version 1..CANONICAL_VERSION', () => {
        expect(versionsOf(CANONICAL_LOCK)).toEqual(Array.from({ length: CANONICAL_VERSION }, (_, i) => i + 1));
    });
});
