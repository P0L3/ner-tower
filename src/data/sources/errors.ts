export type SourceErrorKind = 'network' | 'http' | 'schema' | 'aborted' | 'empty';

/** A curated source could not be loaded. `message` is safe to show in the UI. */
export class SourceLoadError extends Error {
    readonly kind: SourceErrorKind;
    /** HTTP status when `kind` is 'http'. */
    readonly status: number | undefined;
    constructor(kind: SourceErrorKind, message: string, status?: number) {
        super(message);
        this.name = 'SourceLoadError';
        this.kind = kind;
        this.status = status;
    }
}
