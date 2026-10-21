import type { EntitySpan, SentenceData } from './types';

/** A span is usable if it lies inside the sentence and start <= end. */
export function isValidSpan(span: EntitySpan, tokenCount: number): boolean {
    return Number.isInteger(span[0]) && Number.isInteger(span[1])
        && span[0] >= 0 && span[1] >= span[0] && span[1] < tokenCount
        && typeof span[2] === 'string';
}

/**
 * Keeps only sentences the game can build a tower from: well-formed, non-empty, and with at
 * least one valid entity span. Order is preserved (it matters for seed determinism).
 * Part of the ruleset: sentences without platforms would only create unclimbable gaps.
 */
export function filterPlayable(dataset: SentenceData[]): SentenceData[] {
    return dataset.filter(s =>
        s !== null && typeof s === 'object'
        && Array.isArray(s.tokenized_text) && s.tokenized_text.length > 0
        && Array.isArray(s.ner)
        && s.ner.some(span => Array.isArray(span) && isValidSpan(span, s.tokenized_text.length))
    );
}
