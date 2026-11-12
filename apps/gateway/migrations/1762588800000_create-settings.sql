-- Up Migration
-- The gateway's only data: one row holding the user's settings as a JSON object.
-- The gateway validates it against the shared Settings schema on every read and write.

CREATE TABLE settings (
  -- A constant key with a CHECK, so a second row cannot exist.
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  value jsonb NOT NULL CHECK (jsonb_typeof(value) = 'object')
);

-- Down Migration
DROP TABLE settings;
