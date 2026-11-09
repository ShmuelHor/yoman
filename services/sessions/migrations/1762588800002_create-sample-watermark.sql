-- Up Migration
-- The newest sample ever applied. A retried or overlapping batch must not record the same
-- time twice, and once its session is closed only this row still remembers that time.
CREATE TABLE sample_watermark (
  -- A single row: the key can only be true.
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  recorded_until timestamptz NOT NULL
);

-- Down Migration
DROP TABLE sample_watermark;
