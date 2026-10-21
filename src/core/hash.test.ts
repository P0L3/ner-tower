import { describe, it, expect } from 'vitest';
import { hashString } from './hash';

describe('hashString (FNV-1a 32)', () => {
    it('matches known FNV-1a test vectors', () => {
        expect(hashString('')).toBe('811c9dc5');
        expect(hashString('a')).toBe('e40c292c');
    });

    it('is deterministic and sensitive to input', () => {
        expect(hashString('NER Tower')).toBe(hashString('NER Tower'));
        expect(hashString('NER Tower')).not.toBe(hashString('NER tower'));
    });
});
