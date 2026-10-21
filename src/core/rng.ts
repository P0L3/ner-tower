/**
 * Seeded PRNG (Mulberry32). Same seed -> same sequence.
 * Tower generation relies on this being the ONLY source of randomness.
 */
export function seededRandom(a: number): () => number {
    return function () {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
