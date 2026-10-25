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
- [x] Manual browser smoke test: load file → play → game over → `R` / `N`

### M1 — Fix the freeze (#3) + generation-changing fixes 🔒
**Performance**
- [x] Pure `layout.ts`: fixed ruleset metrics (not measured from the font, which differs per OS); no measurer Text objects
- [x] `TowerPlanner` (pure placement: seeded sentence pick + stacking) wired into `GameScene`
- [x] Reduce texture cost: one canvas texture per sentence (`SentenceView`), instead of one Text per token
- [x] Platforms as invisible static zones; reveal flash is a short-lived overlay (`SentenceView.reveal`)
- [x] Frame-budgeted generation (`TowerStreamer`: 3 ms budget, 1200 px lookahead, always >= 1 sentence if needed)
- [x] Culling of sentences below the camera (frees canvas texture, zones and static bodies)
- [x] Keep a single RNG stream for tower generation, consumed strictly in sequence (determinism must not depend on timing; tested with batched generation)
- [x] Measure in browser: no visible hitch while climbing; flat memory over a 10+ minute run

**Rules-affecting fixes 🔒**
- [x] 🔒 Filter sentences with zero valid entities at load time (`filterPlayable`, order-preserving)
- [x] 🔒 Over-long tokens are truncated with an ellipsis to fit one line; invalid spans are ignored (not clamped)
- [x] 🔒 Shared phase functions (`phases.ts`) used by game and generator; every label up to the phase is applied (fixes skipping)
- [x] 🔒 `profileEntities` counts valid spans only; label order tie-break by name (independent of input order/format)
- [x] 🔒 Reachability guarantee: phase-aware pools, up to 16 draws, gap compression, rise <= 260 px (derived from physics), 30 m phase lead
- [x] `npm run analyze` dataset health tool (per-phase climbability report; `--synthetic` for a demo)
- [x] 🔒 Collect all physics/generation constants into `config/ruleset.ts` (`PHYSICS`, `COMBO`, `CAMERA`, `LAYOUT`, `TOWER`)

### M2 — Ruleset v1 freeze 🔒
- [x] Create tiny synthetic fixture dataset (`src/data/fixtures/sample.ts`, original content, safe to ship)
- [x] Golden test: seed + fixture → sentence-ID sequence + layout hash (exists; constants may still be refreshed until the freeze)
- [x] Reachability property test over many seeds and phase distances (independent recomputation)
- [x] Set `RULESET_VERSION = 1`; document the "bump on change" rule (`docs/RULESET.md`, `CONTRIBUTING.md`)
- [x] Lock test: fingerprint of constants, rule functions and generated towers pinned per version (`ruleset.lock.ts`); same for `CANONICAL_VERSION`
- [x] Gameplay rules (jump, camera, score, fall-out) extracted to pure `movement.ts` so the lock can see them

### M3 — Data module (#2)
**Core**
- [X] Canonical `SentenceData` type with optional `meta`
- [X] `canonical.ts`: fixed ordering, validation (indices vs tokens, overlapping spans), filtering, SHA-256 content hash
- [ ] IndexedDB cache keyed by `datasetId@version`
- [X] `profile.ts` extracted from the menu scene

**Generic formats (drag & drop)**
- [X] Canonical JSON / GLiNER-style (current format)
- [X] JSONL
- [X] CoNLL / BIO (port existing parser, handle IOB1/IOB2)
- [X] Auto-detection + clear error messages
- [X] Tighten CoNLL parser: currently any line with >= 2 columns is accepted, so prose parses as a zero-entity dataset (documented in `conll.test.ts`)
- [X] Unit tests with fixtures per format

**Curated sources (one file each)**
- [x] Source interface (`DatasetSource`: id, datasetId, title, description, license, url, version, palette?, `load({onProgress, signal, maxSentences})`); HF dataset viewer client with paging, retries, abort, split discovery
- [x] `clirener-gold.ts` (incl. CliReNER palette; all splits combined, 192 sentences)
- [x] `clirener-silver.ts` (1,027 sentences)
- [ ] `scierc.ts` (document-level span offsets → sentence-level)
- [x] Per-source smoke test against the live endpoint (separate `npm run test:live`, not in CI default)
- [X] First live run of `npm run test:live` on a machine with network: confirms real schema, row counts and the CORS header
- [X] Cap on loaded sentences (configurable, a few thousand) with deterministic selection

**Menu (DOM)**
- [X] Dataset picker (curated list) as the default screen
- [ ] "Paste Hugging Face dataset ID" box (best-effort, uses generic HF path where possible)
- [X] Drag & drop as secondary option
- [x] Loading progress bar, retry on failure, offline use of cached data
- [x] Difficulty settings (existing sliders) + share-code input carried over

### M4 — Config identity (#1a)
- [X] `datasetId`: `hf:org/name@version[/split]` or `local:<content-hash>`
- [X] Versioned, compact share code: `{v, rulesetVersion, datasetId, contentHash, seed, settings}`
- [X] Decode with clear errors: unknown version, dataset mismatch, ruleset mismatch
- [X] Board key = truncated SHA-256 of the canonical config string
- [X] `weekly.ts`: UTC ISO week → seed, fixed settings preset, per-dataset
- [X] Menu: "Weekly challenge" button per dataset
- [X] "New seed" option on game over (in addition to restart with the same seed)
- [X] Tests: encode/decode round trip, week boundaries (UTC), key stability

### M5 — Leaderboard (#1b)
**Backend (`worker/`)**
- [X] D1 schema: `scores(board_key, player_id, nickname, score, created_at)`, unique `(board_key, player_id)` keeping the best score
- [X] `POST /scores` — validate payload shape, nickname length, plausible score bounds, per-IP rate limit
- [X] `GET /boards/:key?limit=` — top N
- [X] CORS configured (incl. `null` origin for local file usage)
- [X] Deploy docs (wrangler steps, free-tier notes)

**Client**
- [X] Build-time `VITE_LEADERBOARD_URL`; absent → leaderboard UI hidden
- [X] Anonymous player ID in localStorage + editable nickname
- [X] Submit on game over (never blocks gameplay; failures are silent/retryable)
- [X] Board view: top N, your rank, per-code board
- [X] Weekly tab per dataset
- [X] "Open board for a pasted code"

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
