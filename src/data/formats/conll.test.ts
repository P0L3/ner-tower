import { describe, it, expect } from 'vitest';
import { parseCoNLL } from './conll';

describe('parseCoNLL', () => {
    it('parses BIO spans into inclusive [start, end, label]', () => {
        const text = [
            'Albert B-PERSON',
            'Einstein I-PERSON',
            'worked O',
            'in O',
            'Princeton B-LOCATION',
            '. O',
            '',
        ].join('\n');
        const [s] = parseCoNLL(text);
        expect(s.tokenized_text).toEqual(['Albert', 'Einstein', 'worked', 'in', 'Princeton', '.']);
        expect(s.ner).toEqual([[0, 1, 'PERSON'], [4, 4, 'LOCATION']]);
    });

    it('splits sentences on blank lines and -DOCSTART-, uses the last column as tag', () => {
        const text = [
            '-DOCSTART- -X- -X- O',
            '',
            'EU NNP B-NP B-ORG',
            'rejects VBZ B-VP O',
            '',
            'Germany NNP B-NP B-LOC',
        ].join('\n');
        const result = parseCoNLL(text);
        expect(result).toHaveLength(2);
        expect(result[0].ner).toEqual([[0, 0, 'ORG']]);
        expect(result[1].ner).toEqual([[0, 0, 'LOC']]);
    });

    it('closes an entity at end of sentence and handles label changes on I- tags', () => {
        const text = ['a B-X', 'b I-X', 'c I-Y'].join('\n');
        expect(parseCoNLL(text)[0].ner).toEqual([[0, 1, 'X'], [2, 2, 'Y']]);
    });

    it('returns an empty array for single-column input', () => {
        expect(parseCoNLL('hello\nworld\n')).toEqual([]);
    });

    // Known leniency (tighten in M3): any line with >= 2 columns is accepted,
    // so plain prose parses as tokens with zero entities.
    it('currently accepts multi-word prose lines (documented leniency)', () => {
        expect(parseCoNLL('just some prose\n')[0].ner).toEqual([]);
    });
});
