-- Up Migration
-- Every column mirrors its bound in @yoman/shared, so bad data cannot be stored even by a bug.

-- `some` and `full` avg10 per resource, every 5 s. Kept for 7 days.
CREATE TABLE pressure_samples (
  ts timestamptz PRIMARY KEY,
  cpu_some double precision NOT NULL CHECK (cpu_some BETWEEN 0 AND 100),
  cpu_full double precision NOT NULL CHECK (cpu_full BETWEEN 0 AND 100),
  memory_some double precision NOT NULL CHECK (memory_some BETWEEN 0 AND 100),
  memory_full double precision NOT NULL CHECK (memory_full BETWEEN 0 AND 100),
  io_some double precision NOT NULL CHECK (io_some BETWEEN 0 AND 100),
  io_full double precision NOT NULL CHECK (io_full BETWEEN 0 AND 100),
  mem_available_pct double precision NOT NULL CHECK (mem_available_pct BETWEEN 0 AND 100),
  swap_active boolean NOT NULL
);

-- The top processes of one process sample. `comm` only, never `cmdline` (SECURITY A9).
CREATE TABLE process_snapshots (
  ts timestamptz NOT NULL,
  pid integer NOT NULL CHECK (pid BETWEEN 1 AND 4194304),
  comm text NOT NULL CHECK (char_length(comm) BETWEEN 1 AND 64),
  container text CHECK (char_length(container) BETWEEN 1 AND 128),
  cpu_pct double precision NOT NULL CHECK (cpu_pct BETWEEN 0 AND 25600),
  rss_bytes bigint NOT NULL CHECK (rss_bytes >= 0),
  io_bytes_per_sec bigint NOT NULL CHECK (io_bytes_per_sec >= 0)
);

CREATE INDEX process_snapshots_ts ON process_snapshots (ts);
CREATE INDEX process_snapshots_process ON process_snapshots (pid, comm, ts);

CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL
    CHECK (type IN ('cpu', 'memory', 'io', 'memory-critical', 'thermal', 'memory-leak')),
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  peak double precision NOT NULL CHECK (peak >= 0 AND peak < 'Infinity'),
  culprits jsonb NOT NULL DEFAULT '[]'
    CHECK (jsonb_typeof(culprits) = 'array' AND jsonb_array_length(culprits) <= 10),
  -- The leaking process; a leak is tracked per process, every other type once.
  pid integer CHECK (pid BETWEEN 1 AND 4194304),
  CHECK (end_at IS NULL OR start_at <= end_at),
  CHECK ((type = 'memory-leak') = (pid IS NOT NULL))
);

-- At most one open incident per condition, and per process for leaks.
CREATE UNIQUE INDEX incidents_single_open ON incidents (type, coalesce(pid, 0)) WHERE end_at IS NULL;
CREATE INDEX incidents_start_at ON incidents (start_at);

-- What the sustain rule remembers between batches: the current run of each condition.
CREATE TABLE condition_tracks (
  type text PRIMARY KEY CHECK (type IN ('cpu', 'memory', 'io', 'memory-critical', 'thermal')),
  run_start timestamptz,
  run_peak double precision NOT NULL CHECK (run_peak >= 0 AND run_peak < 'Infinity'),
  last_at timestamptz,
  CHECK (run_start IS NULL OR run_start <= last_at)
);

-- The newest sample of each kind ever applied. A retried or overlapping batch must not
-- apply the same moment twice, even after its samples were pruned.
CREATE TABLE sample_watermarks (
  kind text PRIMARY KEY CHECK (kind IN ('pressure', 'processes', 'thermal')),
  recorded_until timestamptz NOT NULL
);

-- Down Migration
DROP TABLE sample_watermarks;
DROP TABLE condition_tracks;
DROP TABLE incidents;
DROP TABLE process_snapshots;
DROP TABLE pressure_samples;
