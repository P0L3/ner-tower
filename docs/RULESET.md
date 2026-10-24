# The ruleset and how to change it

NER Tower leaderboards rank scores per **exact seed + settings**. That only means something if
the same seed produces the same tower, with the same rules, forever. The *ruleset* is everything
that decides what a seed produces. It is versioned (`RULESET_VERSION` in `src/config/ruleset.ts`),
and a test makes sure nobody changes it by accident.

## What is part of the ruleset

| Area | Where |
|---|---|
| Layout metrics, tower spacing, physics, combo, camera, reach, phase lead | constants in `src/config/ruleset.ts` |
| How a sentence is laid out (wrapping, truncation, which tokens get platforms) | `src/game/layout.ts` |
| How the tower is built (sentence picks, phases, reachability, gap compression) | `src/game/tower.ts`, `src/game/phases.ts` |
| Which sentences are playable and which label turns unstable first | `src/data/playable.ts`, `src/data/profile.ts` |
| Jump, camera, score and game-over rules | `src/game/movement.ts` |
| Randomness | `src/core/rng.ts` (the only source of randomness for the tower) |

Dataset *normalization* (`src/data/canonical.ts`: canonical order, overlap resolution, content
hash) has its own version, `CANONICAL_VERSION`, with the same mechanism (see below).

## What is not part of it

Anything that only changes how the game looks or performs, never which tower appears or what a
run is worth: rendering (`SentenceView`), streaming and culling (`streamer.ts`), colors, HUD,
audio, menus, particles. Change those freely.

Known limit: the lock covers the constants, the pure rule functions and the generated towers. It
does **not** see the combo state machine or input handling inside `GameScene`. If you change how
combos are earned or how the player accelerates, bump the version by hand.

## The lock

`src/config/ruleset.lock.test.ts` computes a fingerprint (SHA-256) of the rules above, using
fixed fixture datasets, and compares it with the one pinned for the current version in
`src/config/ruleset.lock.ts`. If the rules changed without a bump, the test fails and prints
the exact steps. CI runs it on every push, so it cannot be merged by accident.

## Changing the rules on purpose

Examples: retuning jump physics, changing the reach rule, a new phase mechanic, a layout fix.

1. Make your change and run `npm test`. The lock test fails and shows the new fingerprint.
2. Increment `RULESET_VERSION` in `src/config/ruleset.ts`.
3. Add the new entry to `RULESET_LOCK` in `src/config/ruleset.lock.ts`:
   `2: '<new fingerprint>'`. **Never edit or remove old entries.**
4. Update the golden constants in `src/game/tower.test.ts` if they changed.
5. Say so in the PR description. Players will see a new, empty set of boards.

What the bump does: the version is part of the share code and the board key, so runs under
different versions never share a leaderboard. Old share codes are rejected with a clear message
instead of producing a different tower.

If the lock test fails and you did **not** mean to change the rules, revert your change: the
test just did its job.

## Changing dataset normalization

Same procedure with `CANONICAL_VERSION` (in `src/data/canonical.ts`) and `CANONICAL_LOCK`. It is
mixed into the content hash, so the same raw data gets a new hash and therefore new boards.

## The fixtures are part of the instrument

`makeSyntheticDataset`, `SAMPLE_SENTENCES` and the hostile/edge datasets inside
`src/game/rulesetFingerprint.ts` are the "measuring instrument". Editing them changes every
fingerprint. Add new fixtures instead of editing existing ones; if you must edit one, treat it as
a ruleset change.

## Why a sampled fingerprint is not magic

The fingerprint only protects code paths its fixtures reach. When you fix a rules bug that the
lock did not notice, add a fixture row that reaches it (that is why the hostile and edge datasets
exist).
