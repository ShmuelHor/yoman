-- Up Migration
-- The goals feature was removed, so `goal-breach` is no longer an alert type. Rows that still
-- carry it would violate the narrower check, so they go first.
DELETE FROM alert_policy WHERE type = 'goal-breach';
DELETE FROM queued_alerts WHERE type = 'goal-breach';

ALTER TABLE alert_policy DROP CONSTRAINT alert_policy_type_check;
ALTER TABLE alert_policy ADD CONSTRAINT alert_policy_type_check CHECK (type IN (
  'battery-low', 'battery-critical', 'battery-plugged-full', 'pressure-incident',
  'memory-critical', 'thermal', 'memory-leak'
));

ALTER TABLE queued_alerts DROP CONSTRAINT queued_alerts_type_check;
ALTER TABLE queued_alerts ADD CONSTRAINT queued_alerts_type_check CHECK (type IN (
  'battery-low', 'battery-critical', 'battery-plugged-full', 'pressure-incident',
  'memory-critical', 'thermal', 'memory-leak'
));

-- Down Migration
ALTER TABLE queued_alerts DROP CONSTRAINT queued_alerts_type_check;
ALTER TABLE queued_alerts ADD CONSTRAINT queued_alerts_type_check CHECK (type IN (
  'battery-low', 'battery-critical', 'battery-plugged-full', 'pressure-incident',
  'memory-critical', 'thermal', 'memory-leak', 'goal-breach'
));

ALTER TABLE alert_policy DROP CONSTRAINT alert_policy_type_check;
ALTER TABLE alert_policy ADD CONSTRAINT alert_policy_type_check CHECK (type IN (
  'battery-low', 'battery-critical', 'battery-plugged-full', 'pressure-incident',
  'memory-critical', 'thermal', 'memory-leak', 'goal-breach'
));
