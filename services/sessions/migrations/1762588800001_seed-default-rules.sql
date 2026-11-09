-- Up Migration
-- Starting categories for common Ubuntu apps. They sit at the bottom of the priority range,
-- so any rule the user adds wins, and the user can edit or delete them like their own.
-- The title rule is one above the wm_class rules, so a video in a browser counts as media.
INSERT INTO category_rules (field, match_type, pattern, category, priority) VALUES
  ('wmClass', 'exact', 'code', 'development', 0),
  ('wmClass', 'prefix', 'jetbrains-', 'development', 0),
  ('wmClass', 'contains', 'terminal', 'development', 0),
  ('wmClass', 'contains', 'ptyxis', 'development', 0),
  ('wmClass', 'contains', 'firefox', 'browsing', 0),
  ('wmClass', 'contains', 'chrom', 'browsing', 0),
  ('wmClass', 'contains', 'slack', 'communication', 0),
  ('wmClass', 'contains', 'discord', 'communication', 0),
  ('wmClass', 'contains', 'telegram', 'communication', 0),
  ('wmClass', 'contains', 'thunderbird', 'communication', 0),
  ('wmClass', 'contains', 'spotify', 'media', 0),
  ('wmClass', 'exact', 'vlc', 'media', 0),
  ('wmClass', 'prefix', 'libreoffice', 'office', 0),
  ('title', 'contains', 'youtube', 'media', 1);

-- Down Migration
DELETE FROM category_rules
WHERE (field, match_type, pattern, category, priority) IN (VALUES
  ('wmClass', 'exact', 'code', 'development', 0),
  ('wmClass', 'prefix', 'jetbrains-', 'development', 0),
  ('wmClass', 'contains', 'terminal', 'development', 0),
  ('wmClass', 'contains', 'ptyxis', 'development', 0),
  ('wmClass', 'contains', 'firefox', 'browsing', 0),
  ('wmClass', 'contains', 'chrom', 'browsing', 0),
  ('wmClass', 'contains', 'slack', 'communication', 0),
  ('wmClass', 'contains', 'discord', 'communication', 0),
  ('wmClass', 'contains', 'telegram', 'communication', 0),
  ('wmClass', 'contains', 'thunderbird', 'communication', 0),
  ('wmClass', 'contains', 'spotify', 'media', 0),
  ('wmClass', 'exact', 'vlc', 'media', 0),
  ('wmClass', 'prefix', 'libreoffice', 'office', 0),
  ('title', 'contains', 'youtube', 'media', 1));
