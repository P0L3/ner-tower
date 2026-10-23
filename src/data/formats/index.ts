import { DatasetParseError } from './errors';
import { parseJsonArray } from './json';
import { parseJsonl } from './jsonl';
import { parseCoNLL } from './conll';

export { DatasetParseError } from './errors';

export type DatasetFormat = 'json' | 'jsonl' | 'conll';

/** Sniffs the format from the first non-blank character: `[` JSON array, `{` JSONL, else CoNLL. */
export function detectFormat(text: string): DatasetFormat {
    const first = text.trimStart()[0];
    if (first === '[') return 'json';
    if (first === '{') return 'jsonl';
    return 'conll';
}

export interface ParsedDataset {
    format: DatasetFormat;
    /** Raw rows, not yet validated: canonicalize() decides what is usable. */
    rows: unknown[];
}

/** Parses any supported drag & drop format. Throws DatasetParseError with a readable message. */
export function parseDataset(input: string): ParsedDataset {
    const text = input.replace(/^\uFEFF/, '');
    if (text.trim() === '') throw new DatasetParseError('The file is empty.');
    const format = detectFormat(text);

    let rows: unknown[];
    if (format === 'json') rows = parseJsonArray(text);
    else if (format === 'conll') rows = parseCoNLL(text);
    else {
        try {
            rows = parseJsonl(text);
        } catch (e) {
            // A pretty-printed single object fails on line 1; give a more useful hint than "invalid JSON".
            if (e instanceof DatasetParseError && e.line === 1) {
                let whole: unknown;
                try { whole = JSON.parse(text); } catch { /* not a single object either */ }
                if (whole !== null && typeof whole === 'object' && !Array.isArray(whole)) {
                    throw new DatasetParseError('Found a single JSON object. Expected a JSON array of sentences, or JSONL with one sentence per line.');
                }
            }
            throw e;
        }
    }
    if (rows.length === 0) throw new DatasetParseError(`No sentences found (read as ${format.toUpperCase()}).`);
    return { format, rows };
}
