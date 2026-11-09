-- Up Migration
-- Every column mirrors its bound in @yoman/shared, so bad data cannot be stored even by a bug.

CREATE TABLE apps (
  -- The app's wm_class, as the agent reports it.
  id text PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9._-]{1,128}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 128),
  icon text CHECK (icon ~ '^[a-zA-Z0-9._-]{1,128}$'),
  -- Set only by the user. NULL means the category rules decide.
  category text CHECK (category ~ '^[a-z0-9-]{1,32}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id text NOT NULL REFERENCES apps (id),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  title text CHECK (char_length(title) <= 512),
  category text CHECK (category ~ '^[a-z0-9-]{1,32}$'),
  closed boolean NOT NULL DEFAULT false,
  CHECK (start_at <= end_at)
);

-- At most one session is open: the one the next batch of samples continues.
CREATE UNIQUE INDEX sessions_single_open ON sessions ((true)) WHERE NOT closed;
CREATE INDEX sessions_start_at ON sessions (start_at);
CREATE INDEX sessions_end_at ON sessions (end_at);

CREATE TABLE category_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field text NOT NULL CHECK (field IN ('wmClass', 'title')),
  match_type text NOT NULL CHECK (match_type IN ('exact', 'prefix', 'contains')),
  pattern text NOT NULL CHECK (char_length(pattern) BETWEEN 1 AND 256),
  category text NOT NULL CHECK (category ~ '^[a-z0-9-]{1,32}$'),
  priority integer NOT NULL CHECK (priority BETWEEN 0 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE category_rules;
DROP TABLE sessions;
DROP TABLE apps;
