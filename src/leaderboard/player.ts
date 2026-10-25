import { isPlayerId, normalizeNickname } from './protocol';

/** The part of Web Storage the game uses. */
export interface SyncStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

/** localStorage if it works (it can throw: privacy modes, blocked storage), else a store that lasts until the page closes. */
export function browserStorage(): SyncStorage {
    try {
        const probe = '__ner-tower-probe';
        localStorage.setItem(probe, '1');
        localStorage.removeItem(probe);
        return localStorage;
    } catch {
        const map = new Map<string, string>();
        return { getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); } };
    }
}

/** 128 random bits as 32 hex chars. */
export function newPlayerId(source: Pick<Crypto, 'getRandomValues'> = crypto): string {
    return Array.from(source.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
}

const KEY = 'ner-tower:player';

/**
 * Anonymous identity: a random id made on first use, and an optional nickname. Both live in this
 * browser only. The id is what lets the server keep "your best score"; treat it like a password
 * (the server never lists it).
 */
export class PlayerStore {
    private readonly storage: SyncStorage;
    private readonly makeId: () => string;
    private cache: { id: string; nickname?: string } | undefined;

    constructor(storage: SyncStorage, makeId: () => string = newPlayerId) {
        this.storage = storage;
        this.makeId = makeId;
    }

    private load(): { id: string; nickname?: string } {
        if (this.cache) return this.cache;
        let stored: { id?: unknown; nickname?: unknown } = {};
        try { stored = JSON.parse(this.storage.getItem(KEY) ?? '{}') ?? {}; } catch { /* start fresh */ }
        const id = isPlayerId(stored.id) ? stored.id : this.makeId();
        const nickname = normalizeNickname(stored.nickname);
        this.cache = nickname === undefined ? { id } : { id, nickname };
        this.save();
        return this.cache;
    }

    private save() {
        try { this.storage.setItem(KEY, JSON.stringify(this.cache)); } catch { /* keep it in memory */ }
    }

    get id(): string { return this.load().id; }
    get nickname(): string | undefined { return this.load().nickname; }

    /** Saves the cleaned nickname and returns it, or returns undefined (and saves nothing) if it is not acceptable. */
    setNickname(raw: string): string | undefined {
        const nickname = normalizeNickname(raw);
        if (nickname === undefined) return undefined;
        this.load();
        this.cache = { id: this.cache!.id, nickname };
        this.save();
        return nickname;
    }
}
