import { describe, it, expect } from 'vitest';
import { canonicalize, CANONICAL_VERSION } from './canonical';
import { loadDatasetText } from './load';
import { filterPlayable } from './playable';
import { profileEntities } from './profile';
import { SAMPLE_SENTENCES } from './fixtures/sample';
import { makeSyntheticDataset } from './fixtures/synthetic';
import { DatasetParseError } from './formats/index';

const row = (tokens: string[], ner: unknown[], extra: object = {}) => ({ tokenized_text: tokens, ner, ...extra });

describe('canonicalize: cleaning', () => {
    it('drops malformed rows, rows without a valid entity and duplicates, and reports them', () => {
        const rows = [
            row(['a', 'b'], [[0, 0, 'X']]),
            row(['a', 'b'], [[0, 0, 'X']]),          // duplicate
            row(['c'], []),                          // no entities
            row(['d'], [[3, 1, 'BAD']]),             // only invalid span
            row([], [[0, 0, 'X']]),                  // empty tokens
            row(['e', ' '], [[0, 0, 'X']]),          // blank token
            { tokenized_text: 'nope', ner: [] },
            null, 42,
        ];
        const { sentences, report } = canonicalize(rows);
        expect(sentences).toHaveLength(1);
        expect(report).toMatchObject({ rows: 9, kept: 1, droppedDuplicate: 1, droppedNoEntity: 2, droppedMalformed: 5 });
    });

    it('ignores invalid spans, trims labels and rebuilds text from the tokens', () => {
        const { sentences, report } = canonicalize([
            row(['Heavy', 'rain', 'fell'], [[0, 1, ' WEATHER '], [2, 9, 'OUT_OF_RANGE'], [1, 0, 'BACKWARDS'], [0, 0, '  '], 'junk'], { text: 'ignored' }),
        ]);
        expect(sentences[0].ner).toEqual([[0, 1, 'WEATHER']]);
        expect(sentences[0].text).toBe('Heavy rain fell');
        expect(report.spansInvalid).toBe(4);
    });

    it('sorts spans and resolves overlaps: earlier start wins, longer wins on equal start', () => {
        const { sentences, report } = canonicalize([
            row(['The', 'New', 'York', 'City', 'Marathon', 'starts'], [[3, 4, 'EVENT'], [1, 3, 'LOCATION'], [1, 2, 'CITY'], [5, 5, 'TIME']]),
        ]);
        expect(sentences[0].ner).toEqual([[1, 3, 'LOCATION'], [5, 5, 'TIME']]);
        expect(report.spansOverlapping).toBe(2);
    });

    it('keeps the source id and meta in meta, and assigns unique content-derived ids', () => {
        const { sentences } = canonicalize(makeSyntheticDataset(300, 5, 1).map(s => ({ ...s, meta: { annotator: 'a1' } })));
        expect(new Set(sentences.map(s => s.id)).size).toBe(sentences.length);
        expect(sentences[0].meta).toMatchObject({ annotator: 'a1' });
        expect(sentences[0].meta!.sourceId).toMatch(/^s\d+$/);
        expect(sentences[0].id).not.toBe(sentences[0].meta!.sourceId);
    });

    it('turns the shipped fixture into 9 playable sentences with no overlaps left', () => {
        const { sentences } = canonicalize(SAMPLE_SENTENCES);
        expect(sentences).toHaveLength(9);
        const fx6 = sentences.find(s => s.meta?.sourceId === 'fx-6')!;
        expect(fx6.ner).toEqual([[1, 3, 'LOCATION']]);
        expect(filterPlayable(sentences)).toHaveLength(sentences.length); // idempotent with the ruleset filter
        expect(profileEntities(sentences).length).toBeGreaterThan(0);
    });
});

describe('canonicalize: identity', () => {
    const rows = makeSyntheticDataset(80, 6, 3);

    it('is independent of row order', () => {
        const a = canonicalize(rows), b = canonicalize([...rows].reverse());
        expect(b.contentHash).toBe(a.contentHash);
        expect(b.sentences).toEqual(a.sentences);
    });

    it('hash covers tokens and spans only, not ids, text or meta', () => {
        const base = canonicalize([row(['a', 'b'], [[0, 0, 'X']])]).contentHash;
        expect(canonicalize([row(['a', 'b'], [[0, 0, 'X']], { id: 'other', text: 'zzz', meta: { k: 1 } })]).contentHash).toBe(base);
        expect(canonicalize([row(['a', 'b'], [[0, 0, 'Y']])]).contentHash).not.toBe(base);
        expect(canonicalize([row(['a', 'c'], [[0, 0, 'X']])]).contentHash).not.toBe(base);
    });

    it('is a 64-char hex SHA-256 that depends on the canonical version tag', () => {
        expect(canonicalize(rows).contentHash).toMatch(/^[0-9a-f]{64}$/);
        expect(CANONICAL_VERSION).toBe(1);
    });

    it('gives the same hash for the same content from JSON, JSONL and CoNLL', () => {
        const json = loadDatasetText(JSON.stringify([row(['Marie', 'Curie', 'left'], [[0, 1, 'PERSON']])]));
        const jsonl = loadDatasetText(JSON.stringify(row(['Marie', 'Curie', 'left'], [[0, 1, 'PERSON']])));
        const conll = loadDatasetText('Marie B-PERSON\nCurie I-PERSON\nleft O\n');
        expect(jsonl.canonical.contentHash).toBe(json.canonical.contentHash);
        expect(conll.canonical.contentHash).toBe(json.canonical.contentHash);
    });
});

describe('canonicalize: maxSentences cap', () => {
    const rows = makeSyntheticDataset(120, 6, 5);

    it('keeps a deterministic subset that does not depend on row order', () => {
        const a = canonicalize(rows, { maxSentences: 25 }), b = canonicalize([...rows].reverse(), { maxSentences: 25 });
        expect(a.sentences).toHaveLength(25);
        expect(a.report.droppedByCap).toBe(a.report.rows - a.report.droppedDuplicate - a.report.droppedNoEntity - 25);
        expect(b.sentences).toEqual(a.sentences);
        expect(b.contentHash).toBe(a.contentHash);
    });

    it('the capped set is a prefix of the uncapped canonical order, with a different hash', () => {
        const full = canonicalize(rows), capped = canonicalize(rows, { maxSentences: 25 });
        expect(capped.sentences.map(s => s.id)).toEqual(full.sentences.slice(0, 25).map(s => s.id));
        expect(capped.contentHash).not.toBe(full.contentHash);
    });

    it('ignores a cap that is not a positive integer or not binding', () => {
        const full = canonicalize(rows);
        for (const cap of [0, -3, 1.5, NaN, 10_000]) expect(canonicalize(rows, { maxSentences: cap }).contentHash).toBe(full.contentHash);
    });
});

describe('loadDatasetText', () => {
    it('throws a readable error when nothing is playable', () => {
        expect(() => loadDatasetText(JSON.stringify([row(['a'], []), row(['b'], [[2, 1, 'X']])])))
            .toThrow(/No sentence with a valid entity found \(2 rows read: 2 without a valid entity\)/);
        expect(() => loadDatasetText('prose')).toThrow(DatasetParseError);
    });
});
