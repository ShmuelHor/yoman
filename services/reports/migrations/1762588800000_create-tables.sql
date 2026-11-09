-- Up Migration
-- Every column mirrors its bound in @yoman/shared, so bad data cannot be stored even by a bug.

-- The sessions already counted, so a retried batch never adds the same time twice.
-- Only the id and the end are kept: reports needs no titles.
CREATE TABLE counted_sessions (
  id uuid PRIMARY KEY,
  end_at timestamptz NOT NULL
);

CREATE INDEX counted_sessions_end_at ON counted_sessions (end_at);

-- Time per local day, app and category. Milliseconds, so rounding happens once, on read.
CREATE TABLE daily_rollups (
  day date NOT NULL,
  app_id text NOT NULL CHECK (app_id ~ '^[a-zA-Z0-9._-]{1,128}$'),
  -- NULL is uncategorized time, one row per day and app like any category.
  category text CHECK (category ~ '^[a-z0-9-]{1,32}$'),
  active_ms bigint NOT NULL CHECK (active_ms >= 0),
  CONSTRAINT daily_rollups_key UNIQUE NULLS NOT DISTINCT (day, app_id, category)
);

-- Stretches of continuous focus on one category. A streak belongs to the local day it started on.
CREATE TABLE focus_streaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category ~ '^[a-z0-9-]{1,32}$'),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  CHECK (start_at <= end_at)
);

CREATE INDEX focus_streaks_start_at ON focus_streaks (start_at);
CREATE INDEX focus_streaks_category_end_at ON focus_streaks (category, end_at);

-- Down Migration
DROP TABLE focus_streaks;
DROP TABLE daily_rollups;
DROP TABLE counted_sessions;
