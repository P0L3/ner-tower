# Contributing to NER Tower

## Setup

```bash
npm install
npm run dev        # dev server on http://localhost:5173
npm test           # unit tests (vitest)
npm run build      # type-check + single-file build in dist/
npm run analyze -- path/to/data.json   # dataset health report
npm run test:live  # smoke test against the real Hugging Face API (needs network)
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

## Adding a curated dataset

Curated datasets live in `src/data/sources/`, one small file each, and are loaded in the browser
through the Hugging Face dataset viewer API (no token, no Python, public datasets only).

For a dataset with `tokens` and BIO `ner_tags` (ClassLabel) columns, copy `clirener-silver.ts`:

```ts
export const mySource = hfBioSource({
    id: 'my-source',                  // stable key
    title: 'My Dataset',
    description: 'One line for the picker.',
    license: 'CC BY 4.0',             // shown as attribution
    version: '1.0',
    repo: 'org/dataset-name',         // Hub repo
    palette: { PER: 0xff8800 },       // optional; other labels get generated colors
    expectedRows: 1234,               // what the authors report; lets the live test notice drift
});
```

Then add it to `SOURCES` in `src/data/sources/index.ts` and run `npm run test:live`. It checks that
the viewer answers with a CORS header, that the layout decodes, and that the row count matches.

A dataset with another layout (for example span annotations instead of BIO tags) needs its own
small adapter next to `src/data/hf/bioRows.ts`; keep that dataset's quirks inside its source file.
Rows go through `canonicalize`, so sources never worry about ordering, duplicates or overlapping
spans. Tests use a fake viewer server (`src/data/hf/fakeServer.testutil.ts`), so they run offline.

The leaderboard backend is documented here when it lands.
