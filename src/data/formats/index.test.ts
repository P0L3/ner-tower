import { describe, it, expect } from 'vitest';
import { detectFormat, parseDataset, DatasetParseError } from './index';

const row = { tokenized_text: ['Marie', 'Curie', 'left'], ner: [[0, 1, 'PERSON']] };

describe('detectFormat', () => {
    it('sniffs the first non-blank character', () => {
        expect(detectFormat('  \n[{"a":1}]')).toBe('json');
        expect(detectFormat('{"a":1}\n{"a":2}')).toBe('jsonl');
        expect(detectFormat('Marie B-PERSON')).toBe('conll');
    });
});

describe('parseDataset', () => {
    it('reads a JSON array', () => {
        const r = parseDataset(JSON.stringify([row, row]));
        expect(r.format).toBe('json');
        expect(r.rows).toHaveLength(2);
    });

    it('reads JSONL, ignoring blank lines, CRLF and a BOM', () => {
        const text = '\uFEFF' + JSON.stringify(row) + '\r\n\r\n' + JSON.stringify(row) + '\r\n';
        const r = parseDataset(text);
        expect(r.format).toBe('jsonl');
        expect(r.rows).toHaveLength(2);
    });

    it('reads CoNLL', () => {
        const r = parseDataset('Marie B-PERSON\nCurie I-PERSON\nleft O\n');
        expect(r.format).toBe('conll');
        expect(r.rows).toHaveLength(1);
    });

    it('reports the failing JSONL line', () => {
        const text = JSON.stringify(row) + '\n{not json}\n';
        expect(() => parseDataset(text)).toThrow(/Line 2: invalid JSON/);
        expect(() => parseDataset('{"a":1}\n42\n')).toThrow(/Line 2: each line must be a JSON object/);
    });

    it('explains a pretty-printed single object and a non-array JSON value', () => {
        expect(() => parseDataset('{\n  "data": []\n}')).toThrow(/single JSON object/);
        expect(() => parseDataset('[1,')).toThrow(/Invalid JSON/);
    });

    it('rejects empty input and empty datasets with clear messages', () => {
        expect(() => parseDataset('  \n ')).toThrow(/empty/);
        expect(() => parseDataset('[]')).toThrow(/No sentences found/);
        expect(() => parseDataset('prose without tags')).toThrow(DatasetParseError);
    });
});
