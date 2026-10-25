import { describe, it, expect } from 'vitest';
import { bioTagsToSpans } from './bio';

describe('bioTagsToSpans', () => {
    it('decodes IOB2 spans as inclusive [start, end, label]', () => {
        expect(bioTagsToSpans(['B-PER', 'I-PER', 'O', 'B-LOC'])).toEqual([[0, 1, 'PER'], [3, 3, 'LOC']]);
    });

    it('keeps labels with spaces intact', () => {
        expect(bioTagsToSpans(['B-Body Part', 'I-Body Part', 'O', 'B-Time Period'])).toEqual([[0, 1, 'Body Part'], [3, 3, 'Time Period']]);
    });

    it('treats adjacent B- tags as separate entities, even of the same type', () => {
        expect(bioTagsToSpans(['B-Method', 'B-Method', 'I-Method'])).toEqual([[0, 0, 'Method'], [1, 2, 'Method']]);
    });

    it('handles IOB1: I- opens an entity, a label change on I- splits', () => {
        expect(bioTagsToSpans(['I-X', 'I-X', 'B-X', 'I-X', 'O', 'I-Y', 'I-Z'])).toEqual([[0, 1, 'X'], [2, 3, 'X'], [5, 5, 'Y'], [6, 6, 'Z']]);
    });

    it('closes an entity at the end of the sentence and returns [] when nothing is tagged', () => {
        expect(bioTagsToSpans(['O', 'B-A', 'I-A'])).toEqual([[1, 2, 'A']]);
        expect(bioTagsToSpans(['O', 'O'])).toEqual([]);
        expect(bioTagsToSpans([])).toEqual([]);
    });
});
