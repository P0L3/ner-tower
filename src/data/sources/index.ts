import type { DatasetSource } from './types';
import { clirenerGold } from './clirener-gold';
import { clirenerSilver } from './clirener-silver';
import { demo } from './demo';

export type { DatasetSource, LoadOptions, LoadProgress, LoadedSource } from './types';
export { SourceLoadError } from './errors';

/**
 * Datasets in the order the menu shows them (the first one is preselected). Add a source by adding a
 * file and a line here. The built-in demo comes last: it is for a first, offline taste, not the default.
 */
export const SOURCES: readonly DatasetSource[] = [clirenerGold, clirenerSilver, demo];

/** Sources loaded from the Hugging Face Hub (everything except the built-in demo). */
export const HUB_SOURCES: readonly DatasetSource[] = SOURCES.filter(s => s !== demo);

export function getSource(id: string): DatasetSource | undefined {
    return SOURCES.find(s => s.id === id);
}
