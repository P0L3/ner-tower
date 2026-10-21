# 🗺️ NER Tower — Work Plan

Status legend: `[ ]` todo · `[x]` done · 🔒 = affects tower generation (must land before Ruleset v1 freeze)

---

## 0. Decisions made

| Topic | Decision |
|---|---|
| Distribution | Standalone single-file build (Vite + singlefile), no Python, no server required to play |
| Default data source | Curated Hugging Face datasets (public); drag & drop as the secondary option |
| Dataset loading | One small **source module per curated dataset**; generic **format parsers** for drag & drop |
| Datasets (initial) | `P0L3/CliReNER_v_1_1_28_GOLD`, `P0L3/CliReNER_v_1_1_28_SILVER`, `zj88zj/SCIERC` (more added over time) |
| Leaderboard board key | **Exact seed + settings (share code)** → implicit board per code |
| Weekly challenge | Client-derived: seed = `hash(UTC ISO week, datasetId)`, fixed settings preset, one board per dataset per week |
| Anti-cheat | Honor system + payload validation + rate limiting. Replay verification = future work |
| Backend | Cloudflare Worker + D1 (free tier). URL is a build-time env var; no URL → leaderboard UI hidden |
| UI for non-gameplay screens | Plain TypeScript + CSS DOM overlay (no framework) |
| Style pass | Deferred to the end (minor) |
| Annotator sprites (old roadmap) | Parked. Canonical sentence type gets an optional `meta` field to keep the door open |

---

## 1. Key principle: freeze the rules before the leaderboard

A board is defined by "this exact seed". Anything that changes how a tower is generated silently changes what that seed means. Therefore:

- All 🔒 changes land **before** the first leaderboard submission is possible.
- A **golden test** (fixed seed + fixed fixture dataset → fixed sequence of sentence IDs + layout hash) guards the generator.
- Any later change that breaks the golden test **must bump `RULESET_VERSION`**, which creates a fresh set of boards instead of corrupting old ones.
- Old prototype share codes become invalid. That is acceptable: no leaderboard exists yet.

---

## 2. Target structure

```
src/
  main.ts                  # bootstrap only
  core/        rng.ts · hash.ts · audio.ts
  data/
    types.ts               # canonical SentenceData (+ optional meta)
    canonical.ts           # deterministic normalization, filtering, content hash
    formats/               # drag & drop: canonical-json · jsonl · conll
    sources/               # curated: clirener-gold · clirener-silver · scierc · index
    cache.ts               # IndexedDB cache
    profile.ts             # entity stats / hardness
  game/
    layout.ts              # PURE layout math (no Phaser)
    generator.ts           # incremental, frame-budgeted generation + culling
    scenes/                # MainMenu · Game · GameOver
  config/
    ruleset.ts             # RULESET_VERSION, physics + generation constants
    shareCode.ts           # versioned encode/decode
    weekly.ts              # ISO week → seed
  leaderboard/ client.ts
  ui/                      # DOM menu, leaderboard panel
worker/                    # Cloudflare Worker + D1 schema
*.test.ts                  # vitest, co-located next to the code (adapters, layout, golden, share code)
```

---

## 3. Milestones

### M0 — Repo hygiene & structure
- [x] Delete unused `src/counter.ts`
- [x] Add `vitest` (dev dependency only) and a `npm test` script
- [x] Split `main.ts` into modules per the structure above (no behavior change)
- [x] Move `FIXED_COLORS` out of the game scene (it becomes per-dataset palette in M3)
- [x] Verify `npm run build` still produces a working single file
- [x] Extra: pure helpers extracted (`parseCoNLL`, `profileEntities`) and covered by first unit tests (rng, hash, conll, profile)
- [x] Extra: fixed pre-existing `tsc` error (`update(time, …)` unused param) that broke `npm run build`
- [x] Manual browser smoke test: load file → play → game over → `R` / `N` (needs your eyes)

### M1 — Fix the freeze (#3) + generation-changing fixes 🔒
**Performance**
- [ ] Pure `layout.ts`: compute token positions with monospace metrics (measure one glyph once; no measurer Text objects)
- [ ] Reduce texture cost: one rendered object per sentence (single canvas/Text/RenderTexture) or BitmapText, instead of one Text per token
- [ ] Platforms as lightweight static bodies (no per-token Rectangle game objects if avoidable)
- [ ] Frame-budgeted generation: create 1–2 sentences per frame from a queue, larger lookahead so the player never outruns the tower
- [ ] Culling/recycling of sentences far below the camera (also removes them from the physics group)
- [ ] Keep a single RNG stream for tower generation, consumed strictly in sequence (determinism must not depend on timing)
- [ ] Measure: no frame >~25 ms during generation on a mid-range laptop; flat memory over a 10+ minute run

**Rules-affecting fixes 🔒**
- [ ] 🔒 Filter sentences with zero entities at load time (deterministic)
- [ ] 🔒 Fix phase skipping when height crosses several thresholds at once
- [ ] 🔒 Reachability guarantee: a valid (stable-label) path must exist within max jump reach at every height
- [ ] 🔒 Collect all physics/generation constants into `config/ruleset.ts`

### M2 — Ruleset v1 freeze 🔒
- [ ] Create tiny synthetic fixture dataset (original content, safe to ship)
- [ ] Golden test: seed + fixture → sentence-ID sequence + layout hash
- [ ] Reachability property test over many seeds
- [ ] Set `RULESET_VERSION = 1`; document the "bump on change" rule in the contributor guide

### M3 — Data module (#2)
**Core**
- [ ] Canonical `SentenceData` type with optional `meta`
- [ ] `canonical.ts`: fixed ordering, validation (indices vs tokens, overlapping spans), filtering, SHA-256 content hash
- [ ] IndexedDB cache keyed by `datasetId@version`
- [ ] `profile.ts` extracted from the menu scene

**Generic formats (drag & drop)**
- [ ] Canonical JSON / GLiNER-style (current format)
- [ ] JSONL
- [ ] CoNLL / BIO (port existing parser, handle IOB1/IOB2)
- [ ] Auto-detection + clear error messages
- [ ] Tighten CoNLL parser: currently any line with >= 2 columns is accepted, so prose parses as a zero-entity dataset (documented in `conll.test.ts`)
- [ ] Unit tests with fixtures per format

**Curated sources (one file each)**
- [ ] Source interface: `id, title, description, license, version, palette?, load(onProgress)`
- [ ] `clirener-gold.ts` (incl. CliReNER palette)
- [ ] `clirener-silver.ts`
- [ ] `scierc.ts` (document-level span offsets → sentence-level)
- [ ] Per-source smoke test against the live endpoint (separate `npm run test:live`, not in CI default)
- [ ] Cap on loaded sentences (configurable, a few thousand) with deterministic selection

**Menu (DOM)**
- [ ] Dataset picker (curated list) as the default screen
- [ ] "Paste Hugging Face dataset ID" box (best-effort, uses generic HF path where possible)
- [ ] Drag & drop as secondary option
- [ ] Loading progress bar, retry on failure, offline use of cached data
- [ ] Difficulty settings (existing sliders) + share-code input carried over

### M4 — Config identity (#1a)
- [ ] `datasetId`: `hf:org/name@version[/split]` or `local:<content-hash>`
- [ ] Versioned, compact share code: `{v, rulesetVersion, datasetId, contentHash, seed, settings}`
- [ ] Decode with clear errors: unknown version, dataset mismatch, ruleset mismatch
- [ ] Board key = truncated SHA-256 of the canonical config string
- [ ] `weekly.ts`: UTC ISO week → seed, fixed settings preset, per-dataset
- [ ] Menu: "Weekly challenge" button per dataset
- [ ] "New seed" option on game over (in addition to restart with the same seed)
- [ ] Tests: encode/decode round trip, week boundaries (UTC), key stability

### M5 — Leaderboard (#1b)
**Backend (`worker/`)**
- [ ] D1 schema: `scores(board_key, player_id, nickname, score, created_at)`, unique `(board_key, player_id)` keeping the best score
- [ ] `POST /scores` — validate payload shape, nickname length, plausible score bounds, per-IP rate limit
- [ ] `GET /boards/:key?limit=` — top N
- [ ] CORS configured (incl. `null` origin for local file usage)
- [ ] Deploy docs (wrangler steps, free-tier notes)

**Client**
- [ ] Build-time `VITE_LEADERBOARD_URL`; absent → leaderboard UI hidden
- [ ] Anonymous player ID in localStorage + editable nickname
- [ ] Submit on game over (never blocks gameplay; failures are silent/retryable)
- [ ] Board view: top N, your rank, per-code board
- [ ] Weekly tab per dataset
- [ ] "Open board for a pasted code"

### M6 — Style pass (#4)
- [ ] Scale canvas responsively (Phaser Scale FIT) and anchor DOM overlay to the canvas
- [ ] HUD / menu / game-over polish
- [ ] Items from your list (to be provided)

### M7 — Open-source polish
- [ ] Rewrite README (remove personal roadmap notes; document datasets, share codes, weekly challenge, leaderboard setup)
- [ ] `LICENSE`
- [ ] `.gitignore` incl. `public/assets/player/*`
- [ ] `CONTRIBUTING.md`: how to add a dataset source, ruleset-version rule
- [ ] GitHub Actions: build + test; deploy to Pages (or static HF Space)
- [ ] Tiny sample dataset in the repo for first-run demo
- [ ] Dataset license/attribution shown in the picker

---

## 4. Risks & watch-outs

| Risk | Mitigation |
|---|---|
| Upstream HF dataset changes → seeds mean something else | Content hash is part of the board key; pin versions where the source allows |
| Generation change slips in after freeze | Golden test in CI; bump `RULESET_VERSION` rule |
| HF endpoint quirks (CORS, pagination, schema) | Isolated per-source modules + live smoke tests |
| Perf fix changes visual layout | Layout is ruleset-affecting: land it in M1, before the freeze |
| Fake scores | Accepted (honor system); revisit replay verification later |
| Free-tier backend limits | Rate limiting, small payloads, leaderboard optional |

---

## 5. Suggested first session

1. M0 end to end (small, unlocks everything else)
2. Start M1: pure `layout.ts` + golden-test scaffolding, then incremental generation and culling
