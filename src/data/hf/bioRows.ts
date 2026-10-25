import type { EntitySpan } from '../types';
import { bioTagsToSpans } from '../formats/bio';
import type { HfFeature, HfRow } from './datasetsServer';

/** Finds the ClassLabel names under a feature type, however it is wrapped (`Sequence`, `List`, ...). */
export function findClassLabelNames(type: unknown): string[] | undefined {
    if (type === null || typeof type !== 'object') return undefined;
    const t = type as Record<string, unknown>;
    if (t._type === 'ClassLabel' || 'names' in t) {
        const names = t.names;
        if (Array.isArray(names) && names.every(n => typeof n === 'string')) return names as string[];
        if (names !== null && typeof names === 'object') { // {"0": "O", "1": "B-X"} form
            const entries = Object.entries(names as Record<string, unknown>);
            if (entries.every(([k, v]) => /^\d+$/.test(k) && typeof v === 'string')) {
                const out: string[] = [];
                for (const [k, v] of entries) out[Number(k)] = v as string;
                return out;
            }
        }
    }
    return 'feature' in t ? findClassLabelNames(t.feature) : undefined;
}

export interface BioColumns { tokens: string; tags: string; id?: string }

/** A sentence in the raw shape `canonicalize` accepts. */
export interface RawSentence { id?: string; tokenized_text: string[]; ner: EntitySpan[] }

export interface BioRowsResult {
    rows: RawSentence[];
    /** Rows that were unusable: missing columns, length mismatch, unknown tag. */
    skipped: number;
}

/**
 * Turns viewer rows with `tokens` + BIO `ner_tags` columns into spans. Tags are integers that index
 * the ClassLabel names from the feature description (or already strings). The source's own
 * `text` column is ignored: canonicalization rebuilds the text from the tokens.
 */
export function bioRowsToSentences(rows: readonly HfRow[], features: readonly HfFeature[], cols: BioColumns): BioRowsResult {
    const tagFeature = features.find(f => f.name === cols.tags);
    const names = tagFeature ? findClassLabelNames(tagFeature.type) : undefined;
    const out: RawSentence[] = [];
    let skipped = 0;

    for (const { row } of rows) {
        const tokens = row[cols.tokens];
        const rawTags = row[cols.tags];
        if (!Array.isArray(tokens) || !Array.isArray(rawTags) || tokens.length !== rawTags.length
            || !tokens.every(t => typeof t === 'string')) { skipped++; continue; }

        const tags: string[] = [];
        let ok = true;
        for (const t of rawTags) {
            if (typeof t === 'string') tags.push(t);
            else if (typeof t === 'number' && names && Number.isInteger(t) && names[t] !== undefined) tags.push(names[t]);
            else { ok = false; break; }
        }
        if (!ok) { skipped++; continue; }

        const sentence: RawSentence = { tokenized_text: tokens as string[], ner: bioTagsToSpans(tags) };
        const id = cols.id ? row[cols.id] : undefined;
        if (typeof id === 'string' || typeof id === 'number') sentence.id = String(id);
        out.push(sentence);
    }
    return { rows: out, skipped };
}
