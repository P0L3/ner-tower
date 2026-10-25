import { describe, it, expect } from 'vitest';
import { MAX_SCORE, normalizeNickname, parseSubmission, parseLimit, parseBoardResponse, parseSubmitResponse, isBoardKey, isPlayerId } from './protocol';
import { PHYSICS } from '../config/ruleset';

describe('MAX_SCORE', () => {
    it('is the height of the whole world in meters, so no real run can exceed it', () => {
        expect(MAX_SCORE).toBe(50190);
        expect(MAX_SCORE).toBe(Math.floor((PHYSICS.playerStartY - PHYSICS.worldTop) / 10));
    });
});

describe('normalizeNickname', () => {
    it('trims, collapses whitespace and counts characters, not UTF-16 units', () => {
        expect(normalizeNickname('  Ada   Lovelace ')).toBe('Ada Lovelace');
        expect(normalizeNickname('\u{1F600}'.repeat(20))).toBe('\u{1F600}'.repeat(20));
        expect(normalizeNickname('\u{1F600}'.repeat(21))).toBeUndefined();
        expect(normalizeNickname('x'.repeat(20))).toBeDefined();
        expect(normalizeNickname('x'.repeat(21))).toBeUndefined();
    });
    it('rejects empty, non-strings, control characters and text-direction tricks', () => {
        for (const bad of ['', '   ', 5, null, undefined, 'a\u0000b', 'a\u0007b', 'a\u202eb', 'a\u200bb']) expect(normalizeNickname(bad), String(bad)).toBeUndefined();
    });
    it('treats line breaks and separators as whitespace', () => { expect(normalizeNickname('a\nb')).toBe('a b'); expect(normalizeNickname('a\u2028b')).toBe('a b'); });
    it('is idempotent', () => { const n = normalizeNickname('  a  b ')!; expect(normalizeNickname(n)).toBe(n); });
});

describe('ids and limits', () => {
    it('board keys and player ids are 32 lowercase hex chars', () => {
        for (const f of [isBoardKey, isPlayerId]) {
            expect(f('0'.repeat(32))).toBe(true);
            for (const bad of ['', 'A'.repeat(32), '0'.repeat(31), '0'.repeat(33), 'g'.repeat(32), 5]) expect(f(bad)).toBe(false);
        }
    });
    it('parseLimit clamps and defaults', () => {
        expect([null, '5', '0', '1000', 'x', '-3', '2.5'].map(parseLimit)).toEqual([20, 5, 1, 100, 20, 20, 20]);
    });
});

describe('parseSubmission', () => {
    const ok = { boardKey: 'a'.repeat(32), playerId: 'b'.repeat(32), nickname: ' Ada ', score: 12 };
    it('returns cleaned values and ignores unknown fields', () => {
        expect(parseSubmission({ ...ok, extra: 1 })).toEqual({ ok: true, value: { ...ok, nickname: 'Ada' } });
    });
    it('names the offending field', () => {
        expect(parseSubmission({ ...ok, score: 0 })).toMatchObject({ ok: false, message: expect.stringContaining('score') });
        expect(parseSubmission({ ...ok, nickname: '' })).toMatchObject({ ok: false, message: expect.stringContaining('nickname') });
        expect(parseSubmission({ ...ok, score: MAX_SCORE + 1 }).ok).toBe(false);
        expect(parseSubmission([]).ok).toBe(false);
        expect(parseSubmission(null).ok).toBe(false);
    });
});

describe('response parsers', () => {
    it('accept the real shapes and reject others', () => {
        expect(parseBoardResponse({ key: 'k', total: 2, entries: [{ rank: 1, nickname: 'a', score: 3 }], you: { rank: 2, nickname: 'b', score: 1 } }).ok).toBe(true);
        expect(parseBoardResponse({ key: 'k', total: 0, entries: [] }).ok).toBe(true);
        expect(parseBoardResponse({ key: 'k', total: 0, entries: [{ rank: 'x' }] }).ok).toBe(false);
        expect(parseBoardResponse('<html>').ok).toBe(false);
        expect(parseSubmitResponse({ best: 1, improved: true, rank: 1, total: 1 }).ok).toBe(true);
        expect(parseSubmitResponse({ best: 1 }).ok).toBe(false);
    });
});
