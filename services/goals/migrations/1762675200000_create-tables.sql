-- Up Migration
-- Every column mirrors its bound in @yoman/shared, so bad data cannot be stored even by a bug.

CREATE TABLE goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('max', 'min')),
  target_kind text NOT NULL CHECK (target_kind IN ('app', 'category')),
  -- An app id or a category slug, by target_kind.
  target text NOT NULL CHECK (
    (target_kind = 'app' AND target ~ '^[a-zA-Z0-9._-]{1,128}$')
    OR (target_kind = 'category' AND target ~ '^[a-z0-9-]{1,32}$')
  ),
  minutes integer NOT NULL CHECK (minutes BETWEEN 1 AND 1440),
  -- 0 is Sunday. Uniqueness is the contract's job; the check keeps the values in range.
  days smallint[] NOT NULL CHECK (
    cardinality(days) BETWEEN 1 AND 7 AND days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The latest totals the gateway sent for each day. Goals never read another service's
-- schema, so /progress answers from these.
CREATE TABLE daily_usage (
  date date NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('app', 'category')),
  target text NOT NULL CHECK (
    (target_kind = 'app' AND target ~ '^[a-zA-Z0-9._-]{1,128}$')
    OR (target_kind = 'category' AND target ~ '^[a-z0-9-]{1,32}$')
  ),
  seconds integer NOT NULL CHECK (seconds >= 0),
  PRIMARY KEY (date, target_kind, target)
);

-- The newest day ever evaluated. Days before it are over, which is when a min goal can be
-- breached. Kept apart from daily_usage, because a day with no usage has no rows there.
CREATE TABLE evaluation_watermark (
  -- A single row: the key can only be true.
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  latest_date date NOT NULL
);

-- One row per alert raised. The key is what keeps it to one alert per goal per day.
CREATE TABLE goal_events (
  goal_id uuid NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
  date date NOT NULL,
  minutes_used integer NOT NULL CHECK (minutes_used BETWEEN 0 AND 1440),
  target_minutes integer NOT NULL CHECK (target_minutes BETWEEN 1 AND 1440),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (goal_id, date)
);

-- Down Migration
DROP TABLE goal_events;
DROP TABLE evaluation_watermark;
DROP TABLE daily_usage;
DROP TABLE goals;
