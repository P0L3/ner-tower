# NER Tower leaderboard (Cloudflare Worker + D1)

A small API on Cloudflare's free tier. The game works without it: a build without
`VITE_LEADERBOARD_URL` has no leaderboard UI and makes no requests.

```
POST /scores        { boardKey, playerId, nickname, score }   -> { best, improved, rank, total }
GET  /boards/:key   ?limit=20&player=<playerId>               -> { key, total, entries[], you? }
GET  /health
```

`boardKey` is the 32-hex board key from the game (see [docs/BOARDS.md](../docs/BOARDS.md)); the
server treats it as an opaque string. `you` is present when `player` has a score on the board, with
the **exact rank** however far down it is. Player ids are never returned.

## Deploy

You need a Cloudflare account (the free plan is enough) and Node.

```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create ner-tower      # prints a database_id
```

1. Paste the `database_id` into `wrangler.jsonc`.
2. Create the table, then deploy:

```bash
npm run db:remote                     # applies schema.sql to the remote database
npm run deploy                        # prints https://ner-tower-leaderboard.<you>.workers.dev
```

3. Build the game against it (from the repository root):

```bash
VITE_LEADERBOARD_URL=https://ner-tower-leaderboard.<you>.workers.dev npm run build
```

Or put the line in `.env.production` (see `.env.example`). The URL is baked into the build.

`npm run db:remote` is safe to run again: the schema uses `IF NOT EXISTS`.

## Develop locally

```bash
cd worker
npm run db:local        # local D1 (SQLite file under .wrangler/)
npm run dev             # http://localhost:8787
```

In the repository root, `.env.local` with `VITE_LEADERBOARD_URL=http://localhost:8787`, then
`npm run dev`. Tests need none of this: `npm test` runs the Worker's logic against real SQLite
(`sql.js`) with the real `schema.sql`.

## What it enforces

| Rule | Detail |
|---|---|
| Payload | JSON object, at most 2 KB; `boardKey` and `playerId` 32 lowercase hex; nickname 1 to 20 characters, no control or direction-override characters (whitespace collapses); score a whole number from 1 to 50,190 (the height of the world) |
| Best score | one row per (board, player); only a higher score replaces it; the nickname follows the latest submission |
| Ranking | score descending, then who reached it first, then player id (a total order, so ranks are exact and stable) |
| Rate limit | 10 submissions per minute per IP and Cloudflare location (`ratelimits` in `wrangler.jsonc`). Cloudflare documents this binding as approximate: a speed bump, not a wall |
| CORS | `Access-Control-Allow-Origin: *`, which also covers the `null` origin of a page opened from disk. No cookies are used |

**It is an honor system.** Scores are not verified (replay verification is future work). Anyone who
reads the code can post any score up to the cap. The cap, the rate limit and per-player rows keep
casual abuse small; they do not stop a determined cheater.

## Operating it

```bash
# what is on a board
npx wrangler d1 execute ner-tower --remote --command \
  "SELECT nickname, score FROM scores WHERE board_key='<key>' ORDER BY score DESC LIMIT 20"

# remove a cheater (all boards) or a single entry
npx wrangler d1 execute ner-tower --remote --command "DELETE FROM scores WHERE nickname='Cheater'"

# wipe one board
npx wrangler d1 execute ner-tower --remote --command "DELETE FROM scores WHERE board_key='<key>'"
```

There is no profanity filter. Moderate with the queries above.

## Privacy

Stored per score: board key, a random per-browser player id, nickname, score, time. IP addresses are
not stored; Cloudflare sees them to apply the rate limit. The player id is a bearer secret kept in
the player's browser (it lets them keep their best score): it is only ever sent to the server, never
shown to other players. Clearing site data creates a new identity.

## Cost notes

Rank is computed by counting rows ranked ahead of a player, from the index alone. That is cheap for
boards of thousands of players; for very large boards it reads many index entries per request, which
counts against D1's daily read allowance. See Cloudflare's current pricing and limits pages for
the numbers.
