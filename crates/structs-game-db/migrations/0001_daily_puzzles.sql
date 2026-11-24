CREATE TABLE daily_puzzles (
    puzzle_date      DATE PRIMARY KEY,
    number           INTEGER NOT NULL UNIQUE CHECK (number >= 1),
    template         TEXT NOT NULL,
    template_version INTEGER NOT NULL DEFAULT 1 CHECK (template_version >= 1),
    instance         JSONB NOT NULL,
    rules            TEXT NOT NULL,
    seed             BIGINT NOT NULL,
    goal             INTEGER NOT NULL CHECK (goal >= 0),
    best_score       INTEGER NOT NULL CHECK (best_score >= 0),
    best_solution    JSONB NOT NULL,
    bot_goal_rate    DOUBLE PRECISION NOT NULL CHECK (bot_goal_rate >= 0.0 AND bot_goal_rate <= 1.0),
    bot_best_rate    DOUBLE PRECISION NOT NULL CHECK (bot_best_rate >= 0.0 AND bot_best_rate <= 1.0),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX daily_puzzles_number_idx ON daily_puzzles (number);
