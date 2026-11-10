-- Up Migration
-- Every column mirrors its bound in @yoman/shared, so bad data cannot be stored even by a bug.
-- An app id list is checked through its joined form: ids never contain a space.

CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 128),
  muted_apps text[] NOT NULL CHECK (
    cardinality(muted_apps) <= 500
    AND array_position(muted_apps, NULL) IS NULL
    AND array_to_string(muted_apps, ' ') ~ '^([a-zA-Z0-9._-]{1,128}( |$))*$'
  ),
  -- Apps that keep notifying even when mute_new_apps is on.
  exceptions text[] NOT NULL CHECK (
    cardinality(exceptions) <= 500
    AND array_position(exceptions, NULL) IS NULL
    AND array_to_string(exceptions, ' ') ~ '^([a-zA-Z0-9._-]{1,128}( |$))*$'
  ),
  mute_new_apps boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE focus_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Kept as history after its profile is deleted; the open session's profile cannot be.
  profile_id uuid REFERENCES profiles (id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('manual', 'schedule', 'pomodoro', 'auto')),
  started_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  -- NULL while open. A session past ends_at stays open until something closes it.
  ended_at timestamptz,
  -- Exactly what the session muted, so closing it restores the same apps.
  muted_apps text[] NOT NULL CHECK (
    cardinality(muted_apps) <= 500
    AND array_position(muted_apps, NULL) IS NULL
    AND array_to_string(muted_apps, ' ') ~ '^([a-zA-Z0-9._-]{1,128}( |$))*$'
  ),
  CHECK (started_at < ends_at),
  CHECK (ended_at IS NULL OR ended_at BETWEEN started_at AND ends_at),
  CHECK (ended_at IS NOT NULL OR profile_id IS NOT NULL)
);

-- At most one session is open.
CREATE UNIQUE INDEX focus_sessions_single_open ON focus_sessions ((true)) WHERE ended_at IS NULL;

-- Apps the agent's discovery reported: the candidates for "mute new apps".
CREATE TABLE known_apps (
  app_id text PRIMARY KEY CHECK (app_id ~ '^[a-zA-Z0-9._-]{1,128}$'),
  name text CHECK (char_length(name) BETWEEN 1 AND 128),
  source text NOT NULL CHECK (source IN ('desktop', 'gsettings')),
  first_seen_at timestamptz NOT NULL DEFAULT now()
);

-- The user's level for an alert type. A type without a row keeps the sender's level.
CREATE TABLE alert_policy (
  type text PRIMARY KEY CHECK (type IN (
    'battery-low', 'battery-critical', 'battery-plugged-full', 'pressure-incident',
    'memory-critical', 'thermal', 'memory-leak', 'goal-breach'
  )),
  level text NOT NULL CHECK (level IN ('critical', 'important', 'normal'))
);

-- When each alert key was last let through. Rows older than the 10 min window are pruned.
CREATE TABLE alert_rate_limits (
  alert_key text PRIMARY KEY CHECK (alert_key ~ '^[a-zA-Z0-9:._-]{1,128}$'),
  accepted_at timestamptz NOT NULL
);

-- Alerts held back during focus, handed over in the exit summary.
CREATE TABLE queued_alerts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alert_key text NOT NULL CHECK (alert_key ~ '^[a-zA-Z0-9:._-]{1,128}$'),
  type text NOT NULL CHECK (type IN (
    'battery-low', 'battery-critical', 'battery-plugged-full', 'pressure-incident',
    'memory-critical', 'thermal', 'memory-leak', 'goal-breach'
  )),
  level text NOT NULL CHECK (level IN ('critical', 'important', 'normal')),
  ts timestamptz NOT NULL,
  params jsonb NOT NULL CHECK (jsonb_typeof(params) = 'object'),
  queued_at timestamptz NOT NULL
);

-- Weekly windows for the focus automation (T45).
CREATE TABLE schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  -- 0 is Sunday. Uniqueness is the contract's job; the check keeps the values in range.
  days smallint[] NOT NULL CHECK (
    cardinality(days) BETWEEN 1 AND 7 AND days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
  ),
  start_at text NOT NULL CHECK (start_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- Earlier than start_at means the window runs past midnight.
  end_at text NOT NULL CHECK (end_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  enabled boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_at <> end_at)
);

-- Down Migration
DROP TABLE schedules;
DROP TABLE queued_alerts;
DROP TABLE alert_rate_limits;
DROP TABLE alert_policy;
DROP TABLE known_apps;
DROP TABLE focus_sessions;
DROP TABLE profiles;
