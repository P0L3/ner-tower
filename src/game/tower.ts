import type { SentenceData } from '../data/types';
import { TOWER } from '../config/ruleset';
import { layoutSentence, type SentenceLayout } from './layout';

export interface PlacedSentence {
    /** Index into the dataset the planner was created with. */
    index: number;
    sentence: SentenceData;
    layout: SentenceLayout;
    /** World Y of the sentence block's top / bottom edge. */
    topY: number;
    bottomY: number;
}

/**
 * Deterministic tower plan: picks sentences with the seeded RNG and stacks them upwards.
 *
 * Determinism contract: the RNG is consumed exactly once per `next()` call and nowhere else,
 * so the n-th sentence depends only on (dataset, seed, n), never on timing or player position.
 */
export class TowerPlanner {
    private readonly dataset: SentenceData[];
    private readonly rng: () => number;
    private cursorY: number = TOWER.firstBottomY;

    constructor(dataset: SentenceData[], rng: () => number) {
        if (dataset.length === 0) throw new Error('TowerPlanner needs at least one sentence');
        this.dataset = dataset;
        this.rng = rng;
    }

    /** Bottom edge where the next sentence will be placed (smaller = higher up). */
    get nextBottomY(): number { return this.cursorY; }

    next(): PlacedSentence {
        const index = Math.floor(this.rng() * this.dataset.length);
        const sentence = this.dataset[index];
        const layout = layoutSentence(sentence);
        const bottomY = this.cursorY;
        const topY = bottomY - layout.height;
        this.cursorY = topY - TOWER.sentenceGap;
        return { index, sentence, layout, topY, bottomY };
    }
}
