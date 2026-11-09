-- Up Migration
-- Every column mirrors its bound in @yoman/shared, so bad data cannot be stored even by a bug.

CREATE TABLE battery_samples (
  -- One sample per instant: a retried batch is dropped on this key.
  ts timestamptz PRIMARY KEY,
  -- The calendar date in the offset the sample's timestamp carried; battery_daily groups by it.
  local_date date NOT NULL,
  energy_full_wh double precision NOT NULL CHECK (energy_full_wh BETWEEN 0 AND 1000),
  energy_full_design_wh double precision NOT NULL
    CHECK (energy_full_design_wh > 0 AND energy_full_design_wh <= 1000),
  cycle_count integer NOT NULL CHECK (cycle_count BETWEEN 0 AND 100000),
  power_w double precision NOT NULL CHECK (power_w BETWEEN 0 AND 1000),
  capacity_pct double precision NOT NULL CHECK (capacity_pct BETWEEN 0 AND 100),
  status text NOT NULL
    CHECK (status IN ('charging', 'discharging', 'full', 'not-charging', 'unknown')),
  -- energy_full / energy_full_design, capped at 100.
  health_pct double precision NOT NULL CHECK (health_pct BETWEEN 0 AND 100)
);

CREATE INDEX battery_samples_local_date ON battery_samples (local_date);

CREATE TABLE battery_daily (
  date date PRIMARY KEY,
  health_pct double precision NOT NULL CHECK (health_pct BETWEEN 0 AND 100),
  cycles integer NOT NULL CHECK (cycles BETWEEN 0 AND 100000),
  -- The average draw while discharging; 0 for a day on the charger.
  average_w double precision NOT NULL CHECK (average_w BETWEEN 0 AND 1000)
);

-- What the alert rules remember between batches, so each alert fires once per episode.
CREATE TABLE alert_state (
  -- A single row: the key can only be true.
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  last_ts timestamptz NOT NULL,
  drain text NOT NULL CHECK (drain IN ('none', 'low', 'critical')),
  full_since timestamptz,
  full_alerted boolean NOT NULL
);

-- Down Migration
DROP TABLE alert_state;
DROP TABLE battery_daily;
DROP TABLE battery_samples;
