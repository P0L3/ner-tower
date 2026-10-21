import type { PlacedSentence, TowerPlanner } from './tower';

/** What the streamer needs from a rendered sentence (implemented on top of Phaser in SentenceView). */
export interface StreamedView {
    readonly placed: PlacedSentence;
    hasLabel(label: string): boolean;
    redraw(): void;
    /** `sceneShutdown`: the scene tears down its own objects, only release external resources. */
    destroy(sceneShutdown?: boolean): void;
}

/**
 * Streaming settings. These affect performance only, never what a seed produces:
 * the planner decides content, the streamer only decides WHEN it gets built.
 */
export const STREAM = {
    lookahead: 1200,   // keep the tower built this far above the top of the camera
    cullMargin: 100,   // destroy sentences this far below the bottom of the camera
    budgetMs: 3,       // per-frame time budget for building new sentences
} as const;

/**
 * Builds the tower on demand, within a per-frame time budget, and recycles what the player
 * has left behind. Contains no Phaser code so it can be unit tested.
 */
export class TowerStreamer {
    private readonly planner: TowerPlanner;
    private readonly createView: (placed: PlacedSentence) => StreamedView;
    private views: StreamedView[] = [];

    constructor(planner: TowerPlanner, createView: (placed: PlacedSentence) => StreamedView) {
        this.planner = planner;
        this.createView = createView;
    }

    get liveCount(): number { return this.views.length; }

    /**
     * Call once per frame. Builds sentences until the lookahead is satisfied or the time budget
     * is spent (always at least one if any is needed, so the tower can never stall), then culls.
     * Pass Infinity as budget to fill synchronously (initial build).
     */
    update(cameraTop: number, cameraBottom: number, budgetMs: number = STREAM.budgetMs): void {
        const target = cameraTop - STREAM.lookahead;
        const start = performance.now();
        while (this.planner.nextBottomY > target) {
            this.views.push(this.createView(this.planner.next()));
            if (performance.now() - start >= budgetMs) break;
        }

        // Views are ordered bottom -> top, so only the front can fall out of range.
        const limit = cameraBottom + STREAM.cullMargin;
        while (this.views.length > 0 && this.views[0].placed.topY > limit) {
            this.views.shift()!.destroy();
        }
    }

    /** Redraw every live sentence containing this label (e.g. it just became unstable). */
    refreshLabel(label: string): void {
        for (const v of this.views) if (v.hasLabel(label)) v.redraw();
    }

    dispose(): void {
        for (const v of this.views) v.destroy(true);
        this.views = [];
    }
}
