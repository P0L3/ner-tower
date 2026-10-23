import { sha256Hex } from '../core/hash';
import { isValidSpan } from './playable';
import type { EntitySpan, SentenceData } from './types';

/**
 * Version of the normalization rules below. It is mixed into the content hash, so changing a
 * rule changes the hash (and with it the board key) instead of silently re-meaning old seeds.
 */
export const CANONICAL_VERSION = 1;

export interface CanonicalizeOptions {
    /** Keep at most this many sentences (deterministic, independent of input order). */
    maxSentences?: number;
}

export interface CanonicalReport {
    rows: number;
    kept: number;
    droppedMalformed: number;
    droppedNoEntity: number;
    droppedDuplicate: number;
    droppedByCap: number;
    spansInvalid: number;
    /** Spans removed because they overlap (or duplicate) an earlier span. */
    spansOverlapping: number;
}

export interface CanonicalDataset {
    sentences: SentenceData[];
    /** SHA-256 (hex) over the canonical content of the kept sentences, in canonical order. */
    contentHash: string;
    report: CanonicalReport;
}

interface Entry {
    key: string;
    digest: string;
    tokens: string[];
    spans: EntitySpan[];
    meta: Record<string, unknown> | undefined;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function normalizeRow(row: unknown, report: CanonicalReport): Entry | 'malformed' | 'noEntity' {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) return 'malformed';
    const r = row as Record<string, unknown>;
    const tokens = r.tokenized_text;
    if (!Array.isArray(tokens) || tokens.length === 0 || !tokens.every(t => typeof t === 'string' && t.trim() !== '')) return 'malformed';
    if (!Array.isArray(r.ner)) return 'malformed';

    const spans: EntitySpan[] = [];
    for (const raw of r.ner) {
        const label = Array.isArray(raw) && typeof raw[2] === 'string' ? raw[2].trim() : '';
        const span = (Array.isArray(raw) ? [raw[0], raw[1], label] : []) as unknown as EntitySpan;
        if (label === '' || !isValidSpan(span, tokens.length)) { report.spansInvalid++; continue; }
        spans.push(span);
    }
    // Fixed span order: earliest start first, longer first on ties, then label.
    spans.sort((a, b) => (a[0] - b[0]) || (b[1] - a[1]) || cmp(a[2], b[2]));
    const kept: EntitySpan[] = [];
    let lastEnd = -1;
    for (const s of spans) {
        if (s[0] <= lastEnd) { report.spansOverlapping++; continue; }
        kept.push(s);
        lastEnd = s[1];
    }
    if (kept.length === 0) return 'noEntity';

    const meta: Record<string, unknown> = {};
    if (r.meta !== null && typeof r.meta === 'object' && !Array.isArray(r.meta)) Object.assign(meta, r.meta);
    if (typeof r.id === 'string' || typeof r.id === 'number') meta.sourceId = r.id;

    const key = JSON.stringify([tokens, kept]);
    return { key, digest: sha256Hex(key), tokens: tokens as string[], spans: kept, meta: Object.keys(meta).length > 0 ? meta : undefined };
}

/**
 * Deterministic normalization of raw rows into the dataset the game plays.
 *
 * Rules (CANONICAL_VERSION 1):
 *  - rows need a non-empty `tokenized_text` of non-blank strings and an `ner` array, else dropped;
 *  - spans must be valid (in range, start <= end, non-empty label; labels are trimmed);
 *  - spans are sorted and overlapping ones removed (the earlier / longer one wins);
 *  - sentences without any remaining span are dropped; exact duplicates are dropped;
 *  - `text` is rebuilt from the tokens; `id` becomes a content-derived id (the source id moves to `meta.sourceId`);
 *  - order = ascending SHA-256 of the sentence content, so it is independent of row order and file
 *    format; `maxSentences` keeps the first N of that order (a stable pseudo-random sample).
 *
 * Only tokens and spans feed the content hash; ids, text and meta never do.
 */
export function canonicalize(rows: readonly unknown[], options: CanonicalizeOptions = {}): CanonicalDataset {
    const report: CanonicalReport = {
        rows: rows.length, kept: 0, droppedMalformed: 0, droppedNoEntity: 0, droppedDuplicate: 0,
        droppedByCap: 0, spansInvalid: 0, spansOverlapping: 0,
    };
    const seen = new Set<string>();
    let entries: Entry[] = [];
    for (const row of rows) {
        const e = normalizeRow(row, report);
        if (e === 'malformed') { report.droppedMalformed++; continue; }
        if (e === 'noEntity') { report.droppedNoEntity++; continue; }
        if (seen.has(e.key)) { report.droppedDuplicate++; continue; }
        seen.add(e.key);
        entries.push(e);
    }

    entries.sort((a, b) => cmp(a.digest, b.digest) || cmp(a.key, b.key));

    const cap = options.maxSentences;
    if (cap !== undefined && Number.isInteger(cap) && cap > 0 && entries.length > cap) {
        report.droppedByCap = entries.length - cap;
        entries = entries.slice(0, cap);
    }

    const usedIds = new Set<string>();
    const sentences = entries.map((e): SentenceData => {
        let n = 10, id = e.digest.slice(0, n);
        while (usedIds.has(id)) id = e.digest.slice(0, ++n);
        usedIds.add(id);
        const s: SentenceData = { id, text: e.tokens.join(' '), tokenized_text: e.tokens, ner: e.spans };
        if (e.meta) s.meta = e.meta;
        return s;
    });
    report.kept = sentences.length;

    const contentHash = sha256Hex([`ner-tower-canonical-v${CANONICAL_VERSION}`, ...entries.map(e => e.key)].join('\n'));
    return { sentences, contentHash, report };
}
