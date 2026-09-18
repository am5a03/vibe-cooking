-- Additive only: legacy user/session/account/todo tables are NOT dropped.
CREATE TABLE kitchen_ingredients (
 id TEXT PRIMARY KEY NOT NULL, document TEXT NOT NULL CHECK(json_valid(document)),
 createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE kitchen_recipes (
 id TEXT PRIMARY KEY NOT NULL, document TEXT NOT NULL CHECK(json_valid(document)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
 createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX kitchen_recipes_mode ON kitchen_recipes(json_extract(document,'$.mode'),id);
CREATE INDEX kitchen_recipes_status ON kitchen_recipes(json_extract(document,'$.status'),id);
CREATE TABLE kitchen_recipe_history (
 recipeId TEXT NOT NULL REFERENCES kitchen_recipes(id), revision INTEGER NOT NULL,
 document TEXT NOT NULL CHECK(json_valid(document)),
 createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(recipeId,revision)
);
-- Archive and edit each produce a revision, atomically with the live record.
CREATE TRIGGER kitchen_history_insert AFTER INSERT ON kitchen_recipes BEGIN
 INSERT INTO kitchen_recipe_history(recipeId,revision,document) VALUES(NEW.id,NEW.revision,NEW.document);
END;
CREATE TRIGGER kitchen_revision_guard BEFORE UPDATE ON kitchen_recipes
 WHEN NEW.revision != OLD.revision + 1 OR NEW.id != OLD.id OR NEW.createdAt != OLD.createdAt
 BEGIN SELECT RAISE(ABORT, 'recipe revision must increment exactly once'); END;
CREATE TRIGGER kitchen_history_update AFTER UPDATE ON kitchen_recipes BEGIN
 INSERT INTO kitchen_recipe_history(recipeId,revision,document) VALUES(NEW.id,NEW.revision,NEW.document);
END;
CREATE TRIGGER kitchen_history_no_update BEFORE UPDATE ON kitchen_recipe_history BEGIN
 SELECT RAISE(ABORT, 'recipe history is immutable'); END;
CREATE TRIGGER kitchen_history_no_delete BEFORE DELETE ON kitchen_recipe_history BEGIN
 SELECT RAISE(ABORT, 'recipe history is immutable'); END;
CREATE TABLE kitchen_preferences (
 id TEXT PRIMARY KEY NOT NULL CHECK(id='default'), document TEXT NOT NULL CHECK(json_valid(document)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
 updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO kitchen_preferences(id,document) VALUES('default',
 '{"likedIngredientIds":[],"excludedIngredientIds":[],"defaultDinnerPortions":3,"defaultBreakfastPortions":1,"maxMinutes":null}');
CREATE TABLE kitchen_favourites (
 recipeId TEXT PRIMARY KEY NOT NULL REFERENCES kitchen_recipes(id), recipeRevision INTEGER NOT NULL,
 portions INTEGER NOT NULL CHECK(portions > 0), snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
 createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 FOREIGN KEY(recipeId,recipeRevision) REFERENCES kitchen_recipe_history(recipeId,revision)
);
CREATE TABLE kitchen_notes (
 recipeId TEXT PRIMARY KEY NOT NULL REFERENCES kitchen_recipes(id), document TEXT NOT NULL CHECK(json_valid(document)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
 updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
