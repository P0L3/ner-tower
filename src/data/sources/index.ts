import type { DatasetSource } from './types';
import { clirenerGold } from './clirener-gold';
import { clirenerSilver } from './clirener-silver';

export type { DatasetSource, LoadOptions, LoadProgress, LoadedSource } from './types';
export { SourceLoadError } from './errors';

/** Curated datasets, in the order the menu shows them. Add a source by adding a file and a line here. */
export const SOURCES: readonly DatasetSource[] = [clirenerGold, clirenerSilver];

export function getSource(id: string): DatasetSource | undefined {
    return SOURCES.find(s => s.id === id);
}
