# NER Tower

A browser platformer built from Named Entity Recognition (NER) datasets. Every sentence of a dataset
becomes a row of the tower, every named entity becomes a platform, and as you climb, entity types
start to give way underneath you. Learn which labels still hold.

It runs from a single HTML file: no server, no Python, no account.

## How to play

| Key | Action |
|---|---|
| Left / Right | Run |
| Up | Jump (faster running = higher jump) |
| R / S / N | On the game over screen: restart with the same seed / new seed, same settings / back to the menu |

- Land on entity tokens to climb. Plain words are not solid.
- Every **phase distance** (default 100 m) one more entity type turns **unstable**: you fall through it.
  The right-hand panel (the stability log) shows which types are gone. The type that turns unstable
  last never does, so a way up always exists.
- Landing on higher platforms within 1.5 s builds a **combo**. At 5 you get super jumps.
- The view scrolls up and speeds up with each phase. Fall below the bottom edge and the run ends.
  Your score is the height in meters.

## Datasets

- **Curated:** pick one in the menu. They are loaded in your browser from the public
  [Hugging Face dataset viewer](https://huggingface.co/docs/dataset-viewer), cached for offline play,
  and shown with their license.

  | Dataset | Sentences | License |
  |---|---|---|
  | [CliReNER Gold](https://huggingface.co/datasets/P0L3/CliReNER_v_1_1_28_GOLD) | 192 | CC BY 4.0 |
  | [CliReNER Silver](https://huggingface.co/datasets/P0L3/CliReNER_v_1_1_28_SILVER) | 1,027 | CC BY 4.0 |

- **Your own file:** drop it on the menu. JSON, JSONL and CoNLL (IOB1/IOB2) are detected automatically,
  and problems are reported with line numbers.

JSON / JSONL rows look like this (`id` and `text` are optional):

```json
[
  {
    "tokenized_text": ["Albert", "Einstein", "worked", "in", "Princeton", "."],
    "ner": [[0, 1, "PERSON"], [4, 4, "LOCATION"]]
  }
]
```

`ner` entries are `[first token, last token, label]`, both inclusive. CoNLL files are one
`token ... tag` per line with a blank line between sentences.

Every dataset goes through the same normalization (invalid and overlapping spans removed, duplicates
dropped, fixed order), so the same data gives the same tower whatever the file format. To add a curated
dataset, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Share codes, boards and the weekly challenge

A run is defined by dataset, seed and difficulty settings. The **share code** shown on the game over
screen lets anyone replay exactly that tower: paste it in the menu. Each distinct configuration is its
own leaderboard board. The **weekly challenge** gives everyone the same seed for a dataset each UTC
week, with fixed settings. Details: [docs/BOARDS.md](docs/BOARDS.md).

Seeds only mean something if the rules never silently change, so the generator is pinned by tests
and versioned. See [docs/RULESET.md](docs/RULESET.md) before touching anything that affects towers.

## Leaderboard (optional)

The leaderboard is a small Cloudflare Worker + D1 database on the free tier. A build without
`VITE_LEADERBOARD_URL` has no leaderboard UI and makes no network requests besides dataset loading.
Setup: [worker/README.md](worker/README.md). Scores are an honor system; they are not verified.

## Development

Requires Node.js 22.12 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # type-check + single-file build in dist/index.html
npm run preview
npm run analyze -- path/to/data.json   # how climbable is a dataset?
npm run test:live  # smoke test against the real Hugging Face API (needs network)
```

The build is one self-contained `dist/index.html` that also works opened straight from disk.
The canvas is 850 x 800 and scales to fit the window; the menu and leaderboard panels are DOM
overlays that scale with it.

Built with TypeScript, [Phaser 3](https://phaser.io), Vite and `vite-plugin-singlefile`. Sound effects use
[ZzFX](https://github.com/KilledByAPixel/ZzFX) (MIT).

Project layout and contribution rules are in [CONTRIBUTING.md](CONTRIBUTING.md).
