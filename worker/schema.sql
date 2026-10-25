-- NER Tower leaderboard. One row per (board, player): the player's best score on that board.
CREATE TABLE IF NOT EXISTS scores (
    board_key  TEXT    NOT NULL,   -- 32 hex chars, see docs/BOARDS.md
    player_id  TEXT    NOT NULL,   -- random per-browser id; never sent back to clients
    nickname   TEXT    NOT NULL,
    score      INTEGER NOT NULL,   -- meters climbed
    created_at INTEGER NOT NULL,   -- unix ms when this best score was set; earlier wins ties
    PRIMARY KEY (board_key, player_id)
) WITHOUT ROWID;

-- Serves "top N" and "exact rank" (a count over the better rows) from the index alone.
CREATE INDEX IF NOT EXISTS scores_rank ON scores (board_key, score DESC, created_at ASC, player_id ASC);
