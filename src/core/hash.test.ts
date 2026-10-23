import { describe, it, expect } from 'vitest';
import { hashString, sha256Hex } from './hash';

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

describe('sha256Hex', () => {
    it('matches the FIPS 180-2 test vectors', () => {
        expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
        expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
        expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))
            .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    });

    it('agrees with Web Crypto across padding boundaries and non-ASCII input', async () => {
        const inputs = ['a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(64), 'a'.repeat(65), 'a'.repeat(1000),
            'Zagreb: \u010d\u0107\u017e\u0161\u0111 \u2014 \u6771\u4eac \u{1F5FC}'];
        for (const s of inputs) {
            const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
            const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
            expect(sha256Hex(s)).toBe(hex);
        }
    });
});
