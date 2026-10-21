import type { SentenceData, EntityStats } from './types';

/** Per-label statistics; result is sorted easiest -> hardest by hardnessScore (ascending). */
export function profileEntities(dataset: SentenceData[]): EntityStats[] {
    const statsMap = new Map<string, { count: number, totalTokens: number }>();
    dataset.forEach(s => s.ner.forEach(e => {
        const label = e[2];
        const len = (e[1] - e[0]) + 1;
        if (!statsMap.has(label)) statsMap.set(label, { count: 0, totalTokens: 0 });
        const curr = statsMap.get(label)!;
        curr.count++; curr.totalTokens += len;
    }));
    const entityStats: EntityStats[] = [];
    statsMap.forEach((v, k) => entityStats.push({
        label: k,
        frequency: v.count,
        avgLength: v.totalTokens / v.count,
        hardnessScore: 1000 / (v.count * (v.totalTokens / v.count))
    }));
    entityStats.sort((a, b) => a.hardnessScore - b.hardnessScore);
    return entityStats;
}
