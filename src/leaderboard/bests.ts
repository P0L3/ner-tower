import type { SyncStorage } from './player';
import { isBoardKey } from './protocol';

/**
 * The best score this browser has delivered (or been told about) per board. It lets the game skip
 * submissions that cannot improve anything: the server keeps only the best score per player and
 * board, so sending a worse run would be a write that changes nothing.
 */
export class BestScores {
    private readonly storage: SyncStorage;
    private readonly key: string;
    private readonly max: number;

    constructor(storage: SyncStorage, key = 'ner-tower:bests', max = 200) {
        this.storage = storage;
        this.key = key;
        this.max = max;
    }

    private read(): Record<string, number> {
        try {
            const raw: unknown = JSON.parse(this.storage.getItem(this.key) ?? '{}');
            if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
            const out: Record<string, number> = {};
            for (const [k, v] of Object.entries(raw)) if (isBoardKey(k) && Number.isInteger(v) && (v as number) > 0) out[k] = v as number;
            return out;
        } catch { return {}; }
    }

    get(boardKey: string): number { return this.read()[boardKey] ?? 0; }

    record(boardKey: string, score: number): void {
        const all = this.read();
        if ((all[boardKey] ?? 0) >= score) return;
        delete all[boardKey];           // re-insert last, so the oldest boards are the ones dropped
        all[boardKey] = score;
        const entries = Object.entries(all).slice(-this.max);
        try { this.storage.setItem(this.key, JSON.stringify(Object.fromEntries(entries))); } catch { /* nothing more we can do */ }
    }
}
