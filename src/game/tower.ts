import type { SentenceData } from '../data/types';
import { isValidSpan } from '../data/playable';
import { PHYSICS, PHASE, REACH, TOWER } from '../config/ruleset';
import { layoutSentence, type SentenceLayout } from './layout';
import { heightAtY, phaseAt } from './phases';

export interface PlannerOptions {
    /** Labels from first-to-turn-unstable to last (never unstable); see profileEntities. */
    labelOrder: readonly string[];
    /** Meters per phase (game setting). */
    phaseDist: number;
    /** Pin every placement to this phase. For analysis and tests only; the game never sets it. */
    phaseOverride?: number;
}

export interface PlacedSentence {
    /** Index into the dataset the planner was created with. */
    index: number;
    sentence: SentenceData;
    layout: SentenceLayout;
    /** World Y of the sentence block's top / bottom edge. */
    topY: number;
    bottomY: number;
    /** Phase this sentence was built for (decides which labels count as stable). */
    phase: number;
    /** Vertical gap to the sentence below (TOWER.sentenceGap, or less if compressed). */
    gap: number;
    /** Rise from the highest stable platform below to this sentence's lowest stable platform. */
    entryRise: number;
    /** Largest rise between consecutive stable platforms inside this sentence. */
    internalRise: number;
    /** True if no candidate satisfied the reach rule and the best-effort pick was used. */
    fallback: boolean;
}

interface Candidate {
    idx: number;
    ok: boolean;
    gap: number;
    entryRise: number;
    internalRise: number;
    /** Lower is better; used to pick the fallback. */
    badness: number;
    /** Platform top of the highest stable platform, relative to the sentence top. */
    highRel: number;
    hasStable: boolean;
}

/**
 * Deterministic tower plan.
 *
 * For every placement it (1) works out the phase at that height, (2) draws sentences from the
 * pool that still contain a stable label, and (3) accepts the first draw whose platforms can be
 * climbed (rise <= REACH.maxRise), compressing the gap to the sentence below if that helps.
 *
 * Determinism contract: the result depends only on (dataset, seed, labelOrder, phaseDist) and
 * the call count, never on timing or on where the player is. RNG draws per placement vary
 * (1..REACH.maxDraws) but are a pure function of that state.
 */
export class TowerPlanner {
    private readonly dataset: SentenceData[];
    private readonly rng: () => number;
    private readonly labelOrder: readonly string[];
    private readonly phaseDist: number;
    private readonly phaseOverride: number | undefined;
    private readonly rank = new Map<string, number>();
    private readonly validLabels: string[][];
    private readonly layouts: (SentenceLayout | undefined)[];
    private readonly basePool: number[] = [];

    private pool: number[];
    private poolPhase = 0;
    private prevTop: number = TOWER.firstBottomY + TOWER.sentenceGap; // top edge of the last placed sentence
    private lastStableTop: number = PHYSICS.groundY - PHYSICS.groundHeight / 2; // highest stable platform so far

    constructor(dataset: SentenceData[], rng: () => number, options: PlannerOptions) {
        this.dataset = dataset;
        this.rng = rng;
        this.labelOrder = options.labelOrder;
        this.phaseDist = options.phaseDist;
        this.phaseOverride = options.phaseOverride;
        options.labelOrder.forEach((l, i) => this.rank.set(l, i));

        this.layouts = new Array(dataset.length).fill(undefined);
        this.validLabels = dataset.map((s, i) => {
            const labels = new Set<string>();
            for (const span of s.ner) if (isValidSpan(span, s.tokenized_text.length)) labels.add(span[2]);
            if (labels.size > 0) this.basePool.push(i);
            return [...labels];
        });
        if (this.basePool.length === 0) throw new Error('TowerPlanner needs at least one sentence with a valid entity');
        this.pool = this.basePool;
    }

    /** Bottom edge where the next sentence goes at the default gap (smaller = higher up). */
    get nextBottomY(): number { return this.prevTop - TOWER.sentenceGap; }

    next(): PlacedSentence {
        const defaultBottom = this.nextBottomY;
        const phase = this.phaseOverride ?? phaseAt(heightAtY(defaultBottom) + PHASE.leadMeters, this.phaseDist, this.labelOrder.length);
        const pool = this.poolFor(phase);

        let chosen: Candidate | undefined;
        let best: Candidate | undefined;
        for (let draw = 0; draw < REACH.maxDraws; draw++) {
            const idx = pool[Math.floor(this.rng() * pool.length)];
            const c = this.evaluate(idx, phase);
            if (c.ok) { chosen = c; break; }
            if (!best || c.badness < best.badness) best = c;
        }
        const fallback = chosen === undefined;
        const pick = chosen ?? best!;

        const layout = this.layoutOf(pick.idx);
        const bottomY = this.prevTop - pick.gap;
        const topY = bottomY - layout.height;
        this.prevTop = topY;
        if (pick.hasStable) this.lastStableTop = topY + pick.highRel;

        return {
            index: pick.idx, sentence: this.dataset[pick.idx], layout, topY, bottomY,
            phase, gap: pick.gap, entryRise: pick.entryRise, internalRise: pick.internalRise, fallback,
        };
    }

    private layoutOf(idx: number): SentenceLayout {
        return this.layouts[idx] ??= layoutSentence(this.dataset[idx]);
    }

    private cutoff(phase: number): number {
        return Math.min(Math.max(0, phase), Math.max(0, this.labelOrder.length - 1));
    }

    private isStable(label: string, phase: number): boolean {
        return (this.rank.get(label) ?? Infinity) >= this.cutoff(phase);
    }

    /** Sentences with at least one label that is still stable in `phase`. Phases only go up. */
    private poolFor(phase: number): number[] {
        if (phase < this.poolPhase) { this.pool = this.basePool; this.poolPhase = 0; }
        while (this.poolPhase < phase) {
            this.poolPhase++;
            const p = this.poolPhase;
            const next = this.pool.filter(i => this.validLabels[i].some(l => this.isStable(l, p)));
            if (next.length === 0) { this.poolPhase = phase; break; } // degenerate order: keep what we have
            this.pool = next;
        }
        return this.pool;
    }

    private evaluate(idx: number, phase: number): Candidate {
        const L = this.layoutOf(idx);
        const rel: number[] = []; // platform tops of stable platforms, relative to the sentence top
        for (const t of L.tokens) {
            if (t.label !== undefined && t.platform && this.isStable(t.label, phase)) rel.push(t.platform.y);
        }
        if (rel.length === 0) {
            return { idx, ok: false, gap: REACH.minGap, entryRise: Infinity, internalRise: Infinity, badness: Infinity, highRel: 0, hasStable: false };
        }
        rel.sort((a, b) => a - b); // ascending y = top to bottom
        const highRel = rel[0], lowRel = rel[rel.length - 1];
        let internalRise = 0;
        for (let i = 1; i < rel.length; i++) internalRise = Math.max(internalRise, rel[i] - rel[i - 1]);

        // rise(g) = lastStableTop - (prevTop - g - height + lowRel); solve rise <= maxRise for g
        const riseAt = (g: number) => this.lastStableTop - this.prevTop + g + L.height - lowRel;
        const gap = Math.min(TOWER.sentenceGap, REACH.maxRise - riseAt(0));
        const ok = internalRise <= REACH.maxRise && gap >= REACH.minGap;
        const usedGap = ok ? gap : REACH.minGap;
        return {
            idx, ok, gap: usedGap, entryRise: riseAt(usedGap), internalRise,
            badness: Math.max(internalRise, riseAt(REACH.minGap)), highRel, hasStable: true,
        };
    }
}
