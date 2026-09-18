-- Additive only. Existing recipes, versions, preferences and favourites are untouched.
CREATE TABLE kitchen_remixes (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  source_revision INTEGER NOT NULL,
  target_revision INTEGER NOT NULL,
  axis TEXT NOT NULL CHECK(axis IN ('main','flavor','method')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(source_id < target_id),
  UNIQUE(source_id, target_id),
  FOREIGN KEY(source_id, source_revision) REFERENCES kitchen_recipe_history(recipeId, revision),
  FOREIGN KEY(target_id, target_revision) REFERENCES kitchen_recipe_history(recipeId, revision)
);
CREATE INDEX kitchen_remixes_target ON kitchen_remixes(target_id);
-- Check again in the same write, so a recipe cannot change between review and approval.
CREATE TRIGGER kitchen_remix_insert BEFORE INSERT ON kitchen_remixes BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM kitchen_recipes a, kitchen_recipes b
    WHERE a.id=NEW.source_id AND b.id=NEW.target_id
    AND a.revision=NEW.source_revision AND b.revision=NEW.target_revision
    AND json_extract(a.document,'$.status')='active' AND json_extract(b.document,'$.status')='active'
    AND json_extract(a.document,'$.mode')=json_extract(b.document,'$.mode')
    AND ((json_extract(a.document,'$.main') != json_extract(b.document,'$.main'))
       + (json_extract(a.document,'$.flavor') != json_extract(b.document,'$.flavor'))
       + (json_extract(a.document,'$.method') != json_extract(b.document,'$.method'))) = 1
    AND json_extract(a.document,'$.' || NEW.axis) != json_extract(b.document,'$.' || NEW.axis)
    AND EXISTS (SELECT 1 FROM json_each(a.document,'$.servings') x, json_each(b.document,'$.servings') y
                WHERE json_extract(x.value,'$.portions')=json_extract(y.value,'$.portions'))
  ) THEN RAISE(ABORT, 'REMIX_REVIEW_CONFLICT') END;
END;
CREATE TRIGGER kitchen_remix_update BEFORE UPDATE ON kitchen_remixes BEGIN
  SELECT CASE WHEN NEW.id != OLD.id OR NEW.source_id != OLD.source_id OR NEW.target_id != OLD.target_id
    OR NEW.revision != OLD.revision + 1 THEN RAISE(ABORT, 'REMIX_REVIEW_CONFLICT') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM kitchen_recipes a, kitchen_recipes b
    WHERE a.id=NEW.source_id AND b.id=NEW.target_id
    AND a.revision=NEW.source_revision AND b.revision=NEW.target_revision
    AND json_extract(a.document,'$.status')='active' AND json_extract(b.document,'$.status')='active'
    AND json_extract(a.document,'$.mode')=json_extract(b.document,'$.mode')
    AND ((json_extract(a.document,'$.main') != json_extract(b.document,'$.main'))
       + (json_extract(a.document,'$.flavor') != json_extract(b.document,'$.flavor'))
       + (json_extract(a.document,'$.method') != json_extract(b.document,'$.method'))) = 1
    AND json_extract(a.document,'$.' || NEW.axis) != json_extract(b.document,'$.' || NEW.axis)
    AND EXISTS (SELECT 1 FROM json_each(a.document,'$.servings') x, json_each(b.document,'$.servings') y
                WHERE json_extract(x.value,'$.portions')=json_extract(y.value,'$.portions'))
  ) THEN RAISE(ABORT, 'REMIX_REVIEW_CONFLICT') END;
END;
