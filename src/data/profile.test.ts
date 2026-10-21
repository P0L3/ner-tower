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
});
