-- Up Migration
-- `yoman focus 25` names no profile, so a fresh install needs one to start. It mutes every
-- app the agent discovers; the user can edit, replace or delete it like their own.
INSERT INTO profiles (name, muted_apps, exceptions, mute_new_apps)
VALUES ('Default', '{}', '{}', true);

-- Down Migration
DELETE FROM profiles
WHERE name = 'Default' AND muted_apps = '{}' AND exceptions = '{}' AND mute_new_apps;
