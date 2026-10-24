# Contributing to NER Tower

## Setup

```bash
npm install
npm run dev        # dev server on http://localhost:5173
npm test           # unit tests (vitest)
npm run build      # type-check + single-file build in dist/
npm run analyze -- path/to/data.json   # dataset health report
```

## Before you open a PR

- `npm test` and `npm run build` pass.
- If `ruleset.lock.test.ts` fails, read **[docs/RULESET.md](docs/RULESET.md)**. Either revert, or
  bump the version on purpose, following that document.
- Pure logic (layout, planner, parsers) gets unit tests. Phaser code is thin on purpose: keep
  decisions in pure modules and let the scenes call them.

## Project layout

```
src/core/     rng, hash, audio (no game logic)
src/data/     dataset types, parsers (formats/), canonicalization, profiling
src/game/     layout, tower planner, phases, movement rules, streaming, scenes
src/config/   ruleset constants, settings, ruleset lock
tools/        dev scripts (analyze)
docs/         design notes
```

Adding a curated dataset source and the leaderboard backend are documented here as they land.
