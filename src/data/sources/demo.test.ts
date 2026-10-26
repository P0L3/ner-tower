import { describe, it, expect } from 'vitest';
import { demo } from './demo';
import { loadSource } from './cached';
import { DatasetCache, memoryStore } from '../cache';
import { filterPlayable } from '../playable';
import { profileEntities } from '../profile';
import { TowerPlanner } from '../../game/tower';
import { seededRandom } from '../../core/rng';

describe('built-in demo source', () => {
    it('loads instantly without any network, and matches its declared size', async () => {
        const offline = (async () => { throw new TypeError('no network in this test'); }) as typeof fetch;
        const loaded = await demo.load({ fetch: offline });
        expect(loaded.canonical.sentences).toHaveLength(demo.expectedRows!);
        expect(loaded.rowsSkipped).toBe(0);
        expect(loaded.canonical.contentHash).toMatch(/^[0-9a-f]{64}$/);
    });
    it('is deterministic, and honors a cap', async () => {
        const a = await demo.load(), b = await demo.load();
        expect(b.canonical.contentHash).toBe(a.canonical.contentHash);
        expect((await demo.load({ maxSentences: 4 })).canonical.sentences).toHaveLength(4);
    });
    it('works through the cache-first loader', async () => {
        const res = await loadSource(demo, new DatasetCache(memoryStore()));
        expect(res.canonical.sentences).toHaveLength(9);
    });
    it('makes a tower the generator can build', async () => {
        const { sentences } = (await demo.load()).canonical;
        const data = filterPlayable(sentences);
        expect(data).toHaveLength(sentences.length);
        const planner = new TowerPlanner(data, seededRandom(1), { labelOrder: profileEntities(data).map(x => x.label), phaseDist: 100 });
        for (let i = 0; i < 60; i++) planner.next();
    });
});
