import { describe, it, expect } from 'vitest';
import { bioRowsToSentences, findClassLabelNames } from './bioRows';
import { bioFeatures, CLIRENER_LABEL_NAMES } from './fakeServer.testutil';
import type { HfRow } from './datasetsServer';

// A row of CliReNER gold (CC BY 4.0, P0L3/CliReNER_v_1_1_28_GOLD), as pasted from the dataset viewer.
const GOLD_TOKENS = ['Excluding', 'time', 'points', 'when', 'IM', 'PB', 'was', 'administered', 'within', '7', 'days', 'prior', 'to', 'sampling', '(', 'n', '=', '11', ')', ',', 'peak', 'samples', 'collected', '<', '4', 'h', 'after', 'dosing', '(', 'n', '=', '3', ')', ',', 'and', 'trough', 'samples', 'collected', '>', '28', 'h', 'after', 'dosing', '(', 'n', '=', '14', ')', ',', 'thirty-five', 'time', 'points', 'were', 'trough', 'samples', 'collected', '24', 'h', 'after', 'dosing', '.'];
const GOLD_TAGS = [0, 55, 56, 0, 7, 8, 0, 0, 0, 55, 56, 0, 0, 29, 0, 23, 24, 24, 0, 0, 0, 0, 0, 55, 56, 56, 0, 29, 0, 23, 24, 24, 0, 0, 0, 0, 0, 0, 55, 56, 56, 0, 29, 0, 23, 24, 24, 0, 0, 49, 0, 0, 0, 0, 0, 0, 55, 56, 0, 29, 0];
const goldRow: HfRow = { row_idx: 0, row: { id: '0', text: GOLD_TOKENS.join(' '), tokens: GOLD_TOKENS, ner_tags: GOLD_TAGS } };
const cols = { tokens: 'tokens', tags: 'ner_tags', id: 'id' };

describe('findClassLabelNames', () => {
    const names = ['O', 'B-X', 'I-X'];
    it('finds names under List and Sequence wrappers, and in a bare ClassLabel', () => {
        expect(findClassLabelNames({ feature: { names, _type: 'ClassLabel' }, _type: 'List' })).toEqual(names);
        expect(findClassLabelNames({ feature: { names, _type: 'ClassLabel' }, _type: 'Sequence' })).toEqual(names);
        expect(findClassLabelNames({ names, _type: 'ClassLabel' })).toEqual(names);
    });
    it('accepts the {"0": "O", ...} form of names', () => {
        expect(findClassLabelNames({ names: { '0': 'O', '1': 'B-X', '2': 'I-X' }, _type: 'ClassLabel' })).toEqual(names);
    });
    it('returns undefined when there are no names', () => {
        expect(findClassLabelNames({ dtype: 'string', _type: 'Value' })).toBeUndefined();
        expect(findClassLabelNames({ feature: { dtype: 'int64', _type: 'Value' }, _type: 'List' })).toBeUndefined();
        expect(findClassLabelNames(null)).toBeUndefined();
    });
});

describe('bioRowsToSentences', () => {
    it('decodes a real gold row: label names with spaces, multi-token spans, and the row id', () => {
        const { rows, skipped } = bioRowsToSentences([goldRow], bioFeatures(), cols);
        expect(skipped).toBe(0);
        expect(rows).toHaveLength(1);
        const s = rows[0];
        expect(s.id).toBe('0');
        expect(s.tokenized_text).toHaveLength(61);
        expect(s.ner.slice(0, 5)).toEqual([[1, 2, 'Time Period'], [4, 5, 'Chemical'], [9, 10, 'Time Period'], [13, 13, 'Method'], [15, 17, 'Mathematical Expression']]);
        expect(s.ner.at(-1)).toEqual([59, 59, 'Method']);
        expect(s.ner.map(sp => sp[2]).every(l => !l.startsWith('B-') && !l.startsWith('I-'))).toBe(true);
        expect(s.ner.every(sp => sp[1] < s.tokenized_text.length)).toBe(true);
    });

    it('works with Sequence-typed features as older datasets report them', () => {
        expect(bioRowsToSentences([goldRow], bioFeatures('Sequence'), cols).rows[0].ner).toHaveLength(bioRowsToSentences([goldRow], bioFeatures('List'), cols).rows[0].ner.length);
    });

    it('accepts string tags and needs no label names for them', () => {
        const row: HfRow = { row_idx: 0, row: { tokens: ['a', 'b', 'c'], ner_tags: ['B-Person', 'I-Person', 'O'] } };
        expect(bioRowsToSentences([row], [], { tokens: 'tokens', tags: 'ner_tags' }).rows[0]).toEqual({ tokenized_text: ['a', 'b', 'c'], ner: [[0, 1, 'Person']] });
    });

    it('skips and counts unusable rows instead of guessing', () => {
        const rows: HfRow[] = [
            goldRow,
            { row_idx: 1, row: { id: 'short', tokens: ['a', 'b'], ner_tags: [0] } },                     // length mismatch
            { row_idx: 2, row: { id: 'unknown', tokens: ['a'], ner_tags: [CLIRENER_LABEL_NAMES.length] } }, // tag index out of range
            { row_idx: 3, row: { id: 'nothing' } },                                                       // columns missing
            { row_idx: 4, row: { id: 'nums', tokens: [1, 2], ner_tags: [0, 0] } },                         // tokens not strings
        ];
        const { rows: out, skipped } = bioRowsToSentences(rows, bioFeatures(), cols);
        expect(out).toHaveLength(1);
        expect(skipped).toBe(4);
    });

    it('cannot decode integer tags without label names, and says so by skipping', () => {
        const { rows, skipped } = bioRowsToSentences([goldRow], [{ name: 'ner_tags', type: { dtype: 'int64', _type: 'Value' } }], cols);
        expect(rows).toEqual([]);
        expect(skipped).toBe(1);
    });
});
