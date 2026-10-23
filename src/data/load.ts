import { canonicalize, type CanonicalDataset, type CanonicalizeOptions, type CanonicalReport } from './canonical';
import { parseDataset, DatasetParseError, type DatasetFormat } from './formats/index';

export interface LoadedDataset {
    format: DatasetFormat;
    canonical: CanonicalDataset;
}

function describeDrops(r: CanonicalReport): string {
    const parts = [
        r.droppedMalformed && `${r.droppedMalformed} malformed`,
        r.droppedNoEntity && `${r.droppedNoEntity} without a valid entity`,
        r.droppedDuplicate && `${r.droppedDuplicate} duplicate`,
    ].filter(Boolean);
    return `${r.rows} rows read${parts.length ? ': ' + parts.join(', ') : ''}`;
}

/** Drag & drop pipeline: detect format -> parse -> canonicalize. Throws DatasetParseError. */
export function loadDatasetText(text: string, options: CanonicalizeOptions = {}): LoadedDataset {
    const { format, rows } = parseDataset(text);
    const canonical = canonicalize(rows, options);
    if (canonical.sentences.length === 0) {
        throw new DatasetParseError(`No sentence with a valid entity found (${describeDrops(canonical.report)}).`);
    }
    return { format, canonical };
}
