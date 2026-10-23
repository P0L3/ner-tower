/** Thrown for any user-facing problem with an input file. `message` is safe to show in the UI. */
export class DatasetParseError extends Error {
    /** 1-based line number when the problem is tied to a line. */
    readonly line: number | undefined;
    constructor(message: string, line?: number) {
        super(message);
        this.name = 'DatasetParseError';
        this.line = line;
    }
}

/** Short, single-line excerpt for error messages. */
export function preview(s: string, max = 40): string {
    const t = s.replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max) + '\u2026' : t;
}
