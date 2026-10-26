# Boards, share codes and the weekly challenge

A leaderboard board is **one exact configuration under one ruleset version**. Nothing else
(player, date, device) is part of it.

| Field | Meaning |
|---|---|
| `rulesetVersion` | `RULESET_VERSION` (see [RULESET.md](RULESET.md)) |
| `datasetId` | Hugging Face repo name (`P0L3/CliReNER_v_1_1_28_SILVER`), `ner-tower/demo` for the built-in demo, or `local:file` for a dropped file |
| `contentHash` | first 16 hex chars of the canonical dataset's SHA-256, so changed data is a different board |
| `seed` | integer 0..4294967295 |
| `baseSpeed`, `speedInc`, `phaseDist` | the difficulty sliders; only values on the slider grid are valid (`SETTING_RANGES`) |

## Share code (`src/config/shareCode.ts`)

`NT1-` + base64url of `ruleset|datasetId|contentHash|seed|base*100|inc*100|phase|check`.
`NT1` is the format version; `check` catches typos and truncation. Decoding gives a specific error
for: damaged code, newer code format, other ruleset (older or newer), values off the slider grid.
Codes of the prototype (before M4) are recognized and rejected with a message.

## Board key (`src/config/board.ts`)

`sha256("ner-tower-board-v1|" + the fields above joined by "|")`, first 32 hex chars. The
leaderboard server only ever sees this key. It is the same on every client, and ignores display-only
fields such as the weekly label.

## Weekly challenge (`src/config/weekly.ts`)

Seed = first 32 bits of `sha256("ner-tower-weekly-v1|<UTC ISO week, e.g. 2026-W43>|<datasetId>")`,
with the fixed `WEEKLY_PRESET` settings. No server is involved: everyone derives the same
configuration, and it is simply an ordinary board.

## What may change, and what needs care

- Golden tests pin a share code, a board key and two weekly seeds. If one fails you changed what
  existing codes or boards mean. Do it on purpose: new share code format -> `NT2` (keep reading `NT1`),
  new key layout -> `BOARD_KEY_VERSION`, new weekly derivation -> the tag in `weekly.ts`.
- Narrowing `SETTING_RANGES` or moving its grid makes old codes unreadable. Widening is safe.
- Changing `WEEKLY_PRESET` should happen at a week boundary: clients on different builds would
  otherwise disagree about the current week for a few days.

## Leaderboard (M5)

The server side lives in [worker/](../worker/README.md); the wire format in
`src/leaderboard/protocol.ts` (shared by game and Worker, so validation cannot drift apart).

- **When scores are sent:** automatically at game over. The first time, the game asks for a
  nickname and sends the score right after; later runs need no interaction. The nickname can be
  changed in the menu.
- **Never lost, never blocking:** every score first goes into a local outbox (best per board). If
  the leaderboard is unreachable it stays there and is retried at the next game over, or when the menu opens.
  Scores waiting for a nickname are sent as soon as one is saved.
- **Where to see boards:** on the game over screen (top 10 plus your exact rank), in the menu
  ("Weekly leaderboard" for the selected dataset, and "View the leaderboard for this code" after
  pasting a share code).
- **No URL, no leaderboard:** without `VITE_LEADERBOARD_URL` at build time none of this is shown.
