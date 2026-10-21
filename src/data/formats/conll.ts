import type { SentenceData, EntitySpan } from '../types';

/** Parses CoNLL-style text (token ... tag per line, blank line between sentences, BIO/IOB tags). */
export function parseCoNLL(text: string): SentenceData[] {
    const lines = text.split('\n');
    const dataset: SentenceData[] = [];
    let currentTokens: string[] = [];
    let currentTags: string[] = [];

    const commitSentence = () => {
        if (currentTokens.length > 0) {
            const ner: EntitySpan[] = [];
            let start = -1, label = "";

            for (let i = 0; i < currentTags.length; i++) {
                const tag = currentTags[i];
                if (tag.startsWith('B-')) {
                    if (start !== -1) ner.push([start, i - 1, label]);
                    start = i; label = tag.substring(2);
                } else if (tag.startsWith('I-')) {
                    if (start === -1) { start = i; label = tag.substring(2); }
                    else if (label !== tag.substring(2)) {
                        ner.push([start, i - 1, label]);
                        start = i; label = tag.substring(2);
                    }
                } else {
                    if (start !== -1) { ner.push([start, i - 1, label]); start = -1; label = ""; }
                }
            }
            if (start !== -1) ner.push([start, currentTags.length - 1, label]);
            dataset.push({ text: currentTokens.join(" "), tokenized_text: currentTokens, ner: ner });
            currentTokens = []; currentTags = [];
        }
    };

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('-DOCSTART-')) { commitSentence(); continue; }
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
            currentTokens.push(parts[0]);
            currentTags.push(parts[parts.length - 1]);
        }
    }
    commitSentence();
    return dataset;
}
