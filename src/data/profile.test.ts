import { describe, it, expect } from 'vitest';
import { profileEntities } from './profile';
import type { SentenceData } from './types';

const data: SentenceData[] = [
    { text: '', tokenized_text: ['a', 'b', 'c', 'd'], ner: [[0, 1, 'PERSON'], [3, 3, 'LOC']] },
    { text: '', tokenized_text: ['e', 'f'], ner: [[0, 0, 'PERSON'], [1, 1, 'ORG']] },
    { text: '', tokenized_text: ['g'], ner: [[0, 0, 'PERSON']] },
];

describe('profileEntities', () => {
    it('counts frequency and average length per label', () => {
        const stats = profileEntities(data);
        const person = stats.find(s => s.label === 'PERSON')!;
        expect(person.frequency).toBe(3);
        expect(person.avgLength).toBeCloseTo(4 / 3);
    });

    it('sorts ascending by hardnessScore (most frequent/longest first)', () => {
        const stats = profileEntities(data);
        expect(stats[0].label).toBe('PERSON');
        for (let i = 1; i < stats.length; i++) {
            expect(stats[i].hardnessScore).toBeGreaterThanOrEqual(stats[i - 1].hardnessScore);
        }
    });

    it('returns an empty list when there are no entities', () => {
        expect(profileEntities([{ text: '', tokenized_text: ['x'], ner: [] }])).toEqual([]);
    });

    it('ignores invalid spans (they must not create labels)', () => {
        const stats = profileEntities([
            { text: '', tokenized_text: ['a', 'b'], ner: [[0, 0, 'REAL'], [1, 5, 'PHANTOM'], [1, 0, 'BACKWARDS']] },
        ]);
        expect(stats.map(s => s.label)).toEqual(['REAL']);
    });

    it('breaks hardness ties by label name, independent of input order', () => {
        const a: SentenceData = { text: '', tokenized_text: ['x'], ner: [[0, 0, 'ZED']] };
        const b: SentenceData = { text: '', tokenized_text: ['x'], ner: [[0, 0, 'ALPHA']] };
        expect(profileEntities([a, b]).map(s => s.label)).toEqual(['ALPHA', 'ZED']);
        expect(profileEntities([b, a]).map(s => s.label)).toEqual(['ALPHA', 'ZED']);
    });
});
