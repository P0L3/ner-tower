import type { SentenceData, EntityStats } from './types';
import { isValidSpan } from './playable';

/**
 * Per-label statistics over VALID spans only (invalid spans are never shown in the game, so they
 * must not create labels). Sorted easiest -> hardest: ascending hardnessScore, ties broken by
 * label name so the order does not depend on input row order or file format.
 */
export function profileEntities(dataset: SentenceData[]): EntityStats[] {
    const statsMap = new Map<string, { count: number, totalTokens: number }>();
    for (const s of dataset) {
        if (!Array.isArray(s?.tokenized_text) || !Array.isArray(s?.ner)) continue;
        for (const e of s.ner) {
            if (!Array.isArray(e) || !isValidSpan(e, s.tokenized_text.length)) continue;
            const label = e[2];
            const len = (e[1] - e[0]) + 1;
            if (!statsMap.has(label)) statsMap.set(label, { count: 0, totalTokens: 0 });
            const curr = statsMap.get(label)!;
            curr.count++; curr.totalTokens += len;
        }
    }
    const entityStats: EntityStats[] = [];
    statsMap.forEach((v, k) => entityStats.push({
        label: k,
        frequency: v.count,
        avgLength: v.totalTokens / v.count,
        // 1000 / (count * avgLength) == 1000 / totalTokens; written this way so equal totals tie exactly
        hardnessScore: 1000 / v.totalTokens,
    }));
    entityStats.sort((a, b) => (a.hardnessScore - b.hardnessScore) || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
    return entityStats;
}
