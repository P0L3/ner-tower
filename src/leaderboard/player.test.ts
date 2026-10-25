import { describe, it, expect } from 'vitest';
import { PlayerStore, newPlayerId, type SyncStorage } from './player';
import { Outbox } from './outbox';
import { isPlayerId } from './protocol';

const mem = (): SyncStorage & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
};

describe('newPlayerId', () => {
    it('makes valid, different ids', () => {
        const a = newPlayerId(), b = newPlayerId();
        expect(isPlayerId(a)).toBe(true);
        expect(a).not.toBe(b);
    });
});

describe('PlayerStore', () => {
    it('creates an id once and keeps it across instances', () => {
        const storage = mem();
        const id = new PlayerStore(storage).id;
        expect(isPlayerId(id)).toBe(true);
        expect(new PlayerStore(storage).id).toBe(id);
        expect(new PlayerStore(storage).nickname).toBeUndefined();
    });
    it('saves a cleaned nickname, refuses a bad one, and keeps the id when renaming', () => {
        const storage = mem();
        const p = new PlayerStore(storage);
        const id = p.id;
        expect(p.setNickname('  Ada   L ')).toBe('Ada L');
        expect(p.setNickname('')).toBeUndefined();
        expect(p.nickname).toBe('Ada L');
        expect(new PlayerStore(storage).nickname).toBe('Ada L');
        expect(p.id).toBe(id);
    });
    it('recovers from corrupted or tampered storage', () => {
        const storage = mem();
        storage.setItem('ner-tower:player', '{not json');
        expect(isPlayerId(new PlayerStore(storage).id)).toBe(true);
        storage.setItem('ner-tower:player', JSON.stringify({ id: 'short', nickname: 'x'.repeat(99) }));
        const p = new PlayerStore(storage);
        expect(isPlayerId(p.id)).toBe(true);
        expect(p.nickname).toBeUndefined();
    });
    it('keeps working when storage refuses writes', () => {
        const p = new PlayerStore({ getItem: () => null, setItem: () => { throw new Error('quota'); } });
        expect(p.setNickname('Ada')).toBe('Ada');
        expect(p.nickname).toBe('Ada');
    });
});

describe('Outbox', () => {
    const A = 'a'.repeat(32), B = 'b'.repeat(32);
    it('keeps the best score per board and survives a reload', () => {
        const storage = mem();
        const o = new Outbox(storage);
        o.add(A, 50); o.add(A, 30); o.add(B, 10); o.add(A, 70);
        expect(new Outbox(storage).list()).toEqual([{ boardKey: A, score: 70 }, { boardKey: B, score: 10 }]);
    });
    it('removes an entry only up to the score that was delivered', () => {
        const o = new Outbox(mem());
        o.add(A, 50);
        o.remove(A, 40);
        expect(o.list()).toHaveLength(1);
        o.remove(A, 50);
        expect(o.list()).toEqual([]);
    });
    it('ignores garbage in storage and caps its size', () => {
        const storage = mem();
        storage.setItem('ner-tower:outbox', JSON.stringify([{ boardKey: 'x', score: 1 }, 5, { boardKey: A, score: 1.5 }, { boardKey: A, score: 4 }]));
        expect(new Outbox(storage).list()).toEqual([{ boardKey: A, score: 4 }]);
        const small = new Outbox(mem(), 'k', 3);
        for (let i = 0; i < 6; i++) small.add(i.toString(16).repeat(32), i + 1);
        expect(small.list().map(p => p.score)).toEqual([4, 5, 6]);
    });
});
