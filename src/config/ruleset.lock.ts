/**
 * Pinned fingerprints, one per released version. APPEND ONLY: never edit or delete an old entry,
 * boards of that version rely on it. See docs/RULESET.md for the bump procedure.
 *
 * Verified by `src/config/ruleset.lock.test.ts`.
 */
export const RULESET_LOCK: Readonly<Record<number, string>> = {
    1: '731e71cfbaac6084f4636917262b348cc5e3615560ededa8c708c5bfa25bb30d',
};

/** Same idea for the dataset normalization rules (`CANONICAL_VERSION` in data/canonical.ts). */
export const CANONICAL_LOCK: Readonly<Record<number, string>> = {
    1: 'd9f9dfafb0ff35dfa0597edeb013ce6ca9e10e3da820779ba5e4b7742b3e895f',
};
