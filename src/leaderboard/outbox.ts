import { isBoardKey } from './protocol';
import type { SyncStorage } from './player';

export interface PendingScore { boardKey: string; score: number }

/**
 * Scores that have not reached the server yet, saved in this browser so a failed submission is not
 * lost: it is retried at the next opportunity. The server keeps only the best score per board, so
 * one entry per board (the highest) is enough.
 */
export class Outbox {
    private readonly storage: SyncStorage;
    private readonly key: string;
    private readonly max: number;

    constructor(storage: SyncStorage, key = 'ner-tower:outbox', max = 50) {
        this.storage = storage;
        this.key = key;
        this.max = max;
    }

    list(): PendingScore[] {
        try {
            const raw: unknown = JSON.parse(this.storage.getItem(this.key) ?? '[]');
            if (!Array.isArray(raw)) return [];
            return raw.filter((p): p is PendingScore => p !== null && typeof p === 'object' && isBoardKey((p as PendingScore).boardKey) && Number.isInteger((p as PendingScore).score));
        } catch { return []; }
    }

    private save(items: PendingScore[]) {
        try { this.storage.setItem(this.key, JSON.stringify(items.slice(-this.max))); } catch { /* nothing more we can do */ }
    }

    add(boardKey: string, score: number): void {
        const items = this.list();
        const existing = items.find(p => p.boardKey === boardKey);
        if (existing) existing.score = Math.max(existing.score, score);
        else items.push({ boardKey, score });
        this.save(items);
    }

    /** Removes the entry once `score` has been delivered, unless a better score was queued meanwhile. */
    remove(boardKey: string, score: number): void {
        this.save(this.list().filter(p => !(p.boardKey === boardKey && p.score <= score)));
    }
}
