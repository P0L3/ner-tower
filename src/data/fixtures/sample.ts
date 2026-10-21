import type { EntitySpan, SentenceData } from '../types';

const s = (id: string, tokens: string, ner: EntitySpan[]): SentenceData => {
    const tokenized_text = tokens.split(' ');
    return { id, text: tokenized_text.join(' '), tokenized_text, ner };
};

/**
 * Small synthetic dataset (original text) used by tests and as a future demo dataset.
 * It deliberately contains edge cases: wrapping, an over-long token, overlapping spans,
 * an out-of-range span, a sentence without entities and one whose only span is invalid.
 */
export const SAMPLE_SENTENCES: SentenceData[] = [
    s('fx-1', 'Marie Curie studied radioactivity in Paris .',
        [[0, 1, 'PERSON'], [5, 5, 'LOCATION']]),
    s('fx-2', 'The International Panel on Climate Change published a report in March .',
        [[1, 5, 'ORGANIZATION'], [10, 10, 'DATE']]),
    s('fx-3', 'Researchers at the University of Zagreb measured sea surface temperature near the island of Vis using buoys deployed by the Institute of Oceanography and Fisheries during the summer of 2021 .',
        [[3, 5, 'ORGANIZATION'], [12, 14, 'LOCATION'], [20, 24, 'ORGANIZATION'], [27, 29, 'DATE']]),
    s('fx-4', 'Nothing here is annotated .', []),
    s('fx-5', 'See https://example.org/a/very/long/path/that/keeps/going/and/going/until/it/no/longer/fits/on/one/line for details .',
        [[1, 1, 'URL']]),
    s('fx-6', 'The New York City Marathon starts early .',
        [[1, 3, 'LOCATION'], [3, 4, 'EVENT']]),
    s('fx-7', 'Heavy rain fell .',
        [[0, 1, 'PHENOMENON'], [2, 9, 'IGNORED_OUT_OF_RANGE']]),
    s('fx-8', 'Carbon dioxide levels rose by 2 ppm last year .',
        [[0, 1, 'CHEMICAL'], [5, 6, 'QUANTITY'], [7, 8, 'DATE']]),
    s('fx-9', 'Fieldwork continued .', [[0, 0, 'ACTIVITY']]),
    s('fx-11', 'Only a broken annotation .', [[3, 1, 'BACKWARDS']]),
    s('fx-10', 'Sensors from Acme Instruments recorded wind speed , humidity and pressure every ten minutes at the station .',
        [[2, 3, 'ORGANIZATION'], [5, 6, 'QUANTITY'], [8, 8, 'QUANTITY'], [10, 10, 'QUANTITY']]),
];
