import { DatasetParseError, preview } from './errors';

/** JSON Lines: one sentence object per line, blank lines ignored. */
export function parseJsonl(text: string): unknown[] {
    const rows: unknown[] = [];
    const lines = text.split(/\r?\n/);
    for (let n = 0; n < lines.length; n++) {
        const line = lines[n].trim();
        if (line === '') continue;
        let value: unknown;
        try {
            value = JSON.parse(line);
        } catch (e) {
            throw new DatasetParseError(`Line ${n + 1}: invalid JSON (${(e as Error).message}) near "${preview(line)}".`, n + 1);
        }
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            throw new DatasetParseError(`Line ${n + 1}: each line must be a JSON object.`, n + 1);
        }
        rows.push(value);
    }
    return rows;
}
