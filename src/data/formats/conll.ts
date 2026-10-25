import type { SentenceData } from '../types';
import { bioTagsToSpans } from './bio';
import { DatasetParseError, preview } from './errors';

/** A valid last column: outside, or begin/inside with a non-empty label (IOB1 and IOB2). */
const TAG = /^(?:O|[BI]-.+)$/;

/**
 * Parses CoNLL-style text (`token ... tag` per line, blank line between sentences, IOB1/IOB2 tags).
 * Strict: a data line needs >= 2 columns and a well-formed last column, otherwise a
 * DatasetParseError names the offending line (so plain prose is not mistaken for a dataset).
 */
export function parseCoNLL(text: string): SentenceData[] {
    const lines = text.split(/\r?\n/);
    const dataset: SentenceData[] = [];
    let currentTokens: string[] = [];
    let currentTags: string[] = [];

    const commitSentence = () => {
        if (currentTokens.length > 0) {
            const ner = bioTagsToSpans(currentTags);
            dataset.push({ text: currentTokens.join(" "), tokenized_text: currentTokens, ner: ner });
            currentTokens = []; currentTags = [];
        }
    };

    for (let n = 0; n < lines.length; n++) {
        const trimmed = lines[n].trim();
        if (trimmed === '' || trimmed.startsWith('-DOCSTART-')) { commitSentence(); continue; }
        const parts = trimmed.split(/\s+/);
        if (parts.length < 2) {
            throw new DatasetParseError(`Line ${n + 1}: expected "token ... tag" (at least 2 columns), got "${preview(trimmed)}".`, n + 1);
        }
        const tag = parts[parts.length - 1];
        if (!TAG.test(tag)) {
            throw new DatasetParseError(`Line ${n + 1}: last column must be O, B-<label> or I-<label>, got "${preview(tag)}".`, n + 1);
        }
        currentTokens.push(parts[0]);
        currentTags.push(tag);
    }
    commitSentence();
    return dataset;
}
