import { DatasetParseError } from './errors';

/** Canonical / GLiNER-style JSON: an array of `{ tokenized_text, ner, ... }` objects. */
export function parseJsonArray(text: string): unknown[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        throw new DatasetParseError(`Invalid JSON: ${(e as Error).message}`);
    }
    if (!Array.isArray(parsed)) {
        throw new DatasetParseError('JSON must be an array of sentence objects: [{ "tokenized_text": [...], "ner": [[start, end, label]] }, ...].');
    }
    return parsed;
}
