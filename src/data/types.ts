export interface EntitySpan {
    0: number; // token_span_start
    1: number; // token_span_end (inclusive)
    2: string; // label (e.g. "PERSON", "FACILITY")
}

export interface SentenceData {
    id?: string;
    text: string;
    tokenized_text: string[];
    ner: EntitySpan[];
    /**
     * Optional source-specific payload (e.g. `sourceId`, annotator id). Never hashed and never
     * read by the tower generator, so it cannot change what a seed produces.
     */
    meta?: Record<string, unknown>;
}

/** Profiler output, one entry per entity label. */
export interface EntityStats {
    label: string;
    frequency: number;
    avgLength: number;
    hardnessScore: number;
}
