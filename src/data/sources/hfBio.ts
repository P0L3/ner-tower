import { canonicalize } from '../canonical';
import { fetchAllRows, fetchSplits, type HfClientOptions } from '../hf/datasetsServer';
import { bioRowsToSentences } from '../hf/bioRows';
import { SourceLoadError } from './errors';
import type { DatasetSource, LoadOptions, LoadedSource } from './types';

export interface HfBioSourceConfig {
    id: string;
    title: string;
    description: string;
    license: string;
    version: string;
    /** Hub repo, e.g. 'P0L3/CliReNER_v_1_1_28_GOLD'. */
    repo: string;
    /** Used when the viewer's /splits cannot be asked. */
    fallback?: { config: string; splits: string[] };
    columns?: { tokens: string; tags: string; id?: string };
    palette?: Readonly<Record<string, number>>;
    expectedRows?: number;
}

/**
 * A curated dataset on the Hugging Face Hub with `tokens` + BIO `ner_tags` (ClassLabel) columns,
 * loaded through the dataset viewer API. All splits are played together: these datasets are
 * small, and the game has no train/test notion.
 */
export function hfBioSource(cfg: HfBioSourceConfig): DatasetSource {
    const cols = cfg.columns ?? { tokens: 'tokens', tags: 'ner_tags', id: 'id' };
    const fallback = cfg.fallback ?? { config: 'default', splits: ['train', 'validation', 'test'] };

    return {
        id: cfg.id,
        datasetId: cfg.repo,
        title: cfg.title,
        description: cfg.description,
        license: cfg.license,
        url: `https://huggingface.co/datasets/${cfg.repo}`,
        version: cfg.version,
        palette: cfg.palette,
        expectedRows: cfg.expectedRows,

        async load(options: LoadOptions = {}): Promise<LoadedSource> {
            const client: HfClientOptions = { fetch: options.fetch, sleep: options.sleep, signal: options.signal };

            options.onProgress?.({ phase: 'discover' });
            let config = fallback.config;
            let splits = fallback.splits;
            try {
                const found = await fetchSplits(cfg.repo, client);
                if (found.length > 0) {
                    config = found.some(s => s.config === fallback.config) ? fallback.config : found[0].config;
                    splits = found.filter(s => s.config === config).map(s => s.split);
                }
            } catch (e) {
                // A viewer that cannot list splits (yet) is not fatal; being offline or cancelled is.
                if (!(e instanceof SourceLoadError) || e.kind === 'network' || e.kind === 'aborted') throw e;
            }

            const { features, rows } = await fetchAllRows(cfg.repo, config, splits, client,
                (loaded, total) => options.onProgress?.({ phase: 'download', loaded, total }));

            options.onProgress?.({ phase: 'parse' });
            const parsed = bioRowsToSentences(rows, features, cols);
            const canonical = canonicalize(parsed.rows, { maxSentences: options.maxSentences });
            if (canonical.sentences.length === 0) {
                throw new SourceLoadError('empty', `No usable sentences found in ${cfg.repo} (${rows.length} rows read). Did the dataset layout change?`);
            }
            options.onProgress?.({ phase: 'done' });
            return { canonical, rowsRead: rows.length, rowsSkipped: parsed.skipped };
        },
    };
}
