-- Custom SQLite triggers are intentionally outside Drizzle snapshots.
-- Use conditional SELECTs: nested CASE terminators can confuse D1's remote query parser.
-- Keep uppercase BEGIN/END and LF line endings. See docs/D1-TRIGGER-RECOVERY.md.
-- Check again in the same write, so a recipe cannot change between review and approval.
CREATE TRIGGER IF NOT EXISTS kitchen_remix_insert BEFORE INSERT ON kitchen_remixes BEGIN
  SELECT RAISE(ABORT, 'REMIX_REVIEW_CONFLICT') WHERE NOT EXISTS (
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
  );
END;
CREATE TRIGGER IF NOT EXISTS kitchen_remix_update BEFORE UPDATE ON kitchen_remixes BEGIN
  SELECT RAISE(ABORT, 'REMIX_REVIEW_CONFLICT')
    WHERE NEW.id != OLD.id OR NEW.source_id != OLD.source_id OR NEW.target_id != OLD.target_id
    OR NEW.revision != OLD.revision + 1;
  SELECT RAISE(ABORT, 'REMIX_REVIEW_CONFLICT') WHERE NOT EXISTS (
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
  );
END;
