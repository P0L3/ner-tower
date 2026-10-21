import { describe, it, expect } from 'vitest';
import { filterPlayable, isValidSpan } from './playable';
import { SAMPLE_SENTENCES } from './fixtures/sample';
import type { SentenceData } from './types';

describe('isValidSpan', () => {
    it('accepts in-range spans and rejects bad ones', () => {
        expect(isValidSpan([0, 0, 'A'], 1)).toBe(true);
        expect(isValidSpan([1, 3, 'A'], 4)).toBe(true);
        expect(isValidSpan([3, 1, 'A'], 4)).toBe(false);   // start > end
        expect(isValidSpan([-1, 1, 'A'], 4)).toBe(false);  // negative
        expect(isValidSpan([2, 4, 'A'], 4)).toBe(false);   // past the end
        expect(isValidSpan([0.5, 1, 'A'], 4)).toBe(false); // non-integer
    });
});

describe('filterPlayable', () => {
    it('drops sentences without a valid entity, keeps the rest in order', () => {
        const ids = filterPlayable(SAMPLE_SENTENCES).map(s => s.id);
        expect(ids).not.toContain('fx-4');  // no entities
        expect(ids).not.toContain('fx-11'); // only an invalid span
        expect(ids).toEqual(['fx-1', 'fx-2', 'fx-3', 'fx-5', 'fx-6', 'fx-7', 'fx-8', 'fx-9', 'fx-10']);
    });

    it('does not throw on malformed entries', () => {
        const junk = [null, 42, {}, { tokenized_text: 'x', ner: [] }, { tokenized_text: [], ner: [] }] as unknown as SentenceData[];
        expect(filterPlayable(junk)).toEqual([]);
    });
});
