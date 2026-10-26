import { canonicalize } from '../canonical';
import { SAMPLE_SENTENCES } from '../fixtures/sample';
import type { DatasetSource, LoadOptions, LoadedSource } from './types';

/**
 * Built-in demo dataset: a few short sentences of original text that ship with the game, so the
 * very first run works instantly, offline, without any download. It is the same fixture the tests
 * use (data/fixtures/sample.ts), which is why it must not be edited: changing it changes the demo's
 * content hash (new boards) and the ruleset fingerprint.
 */
export const demo: DatasetSource = {
    id: 'demo',
    datasetId: 'ner-tower/demo',
    title: 'Demo (built in)',
    description: 'A handful of short sentences bundled with the game. Plays instantly, offline: a taste of the tower.',
    license: 'MIT',
    url: '', // bundled with the game: there is nothing to link to
    version: '1',
    expectedRows: 9,

    async load(options: LoadOptions = {}): Promise<LoadedSource> {
        options.onProgress?.({ phase: 'parse' });
        const canonical = canonicalize(SAMPLE_SENTENCES, { maxSentences: options.maxSentences });
        options.onProgress?.({ phase: 'done' });
        return { canonical, rowsRead: SAMPLE_SENTENCES.length, rowsSkipped: 0 };
    },
};
