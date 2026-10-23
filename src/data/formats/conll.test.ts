import { describe, it, expect } from 'vitest';
import { parseCoNLL } from './conll';
import { DatasetParseError } from './errors';

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

    it('handles IOB1: I- opens an entity, B- only separates adjacent entities of the same type', () => {
        const text = ['a I-X', 'b I-X', 'c B-X', 'd I-X', 'e O'].join('\n');
        expect(parseCoNLL(text)[0].ner).toEqual([[0, 1, 'X'], [2, 3, 'X']]);
    });

    it('accepts CRLF line endings and returns [] for empty input', () => {
        expect(parseCoNLL('a B-X\r\nb O\r\n')[0].ner).toEqual([[0, 0, 'X']]);
        expect(parseCoNLL('')).toEqual([]);
    });

    it('rejects single-column input, naming the line', () => {
        expect(() => parseCoNLL('hello\nworld\n')).toThrow(DatasetParseError);
        expect(() => parseCoNLL('hello\nworld\n')).toThrow(/Line 1/);
    });

    it('rejects prose and malformed tags instead of parsing them as a zero-entity dataset', () => {
        expect(() => parseCoNLL('just some prose\n')).toThrow(/Line 1: last column must be O, B-<label> or I-<label>, got "prose"/);
        expect(() => parseCoNLL('ok O\nbad B-\n')).toThrow(/Line 2/);
        expect(() => parseCoNLL('ok O\nbad b-X\n')).toThrow(/Line 2/);
    });
});
