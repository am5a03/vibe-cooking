import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { TestD1 } from "./d1-adapter.mjs";
import { handle } from "../lib/kitchen/api.ts";
import {
  validateFlavor,
  blankFlavor,
  matchesFlavor,
  flavorName,
  FLAVOR_STYLES,
} from "../lib/kitchen/flavors.ts";
import { variationAxis, assessMeal, ingredientResolver } from "../lib/kitchen/exploration.ts";
const presets = JSON.parse(
  readFileSync(new URL("../examples/flavor-profiles.json", import.meta.url), "utf8"),
);
const catalogue = JSON.parse(
  readFileSync(new URL("../examples/catalogue.json", import.meta.url), "utf8"),
);
const token = "e".repeat(64);
const makeProfile = () => ({
  ...blankFlavor(),
  name: "My lemon–dill dressing",
  styles: ["mediterranean"],
  tasteTags: ["herby"],
  keyIngredients: [{ name: "Fresh dill", ingredientId: null }],
  applications: ["dressing"],
  usage: "Use recipe-specific quantities.",
});
function setup(t) {
  const DB = new TestD1();
  t.after(() => DB.close());
  async function call(path, method = "GET", value = undefined, tag = undefined, auth = true) {
    const response = await handle(
      new Request(`https://kitchen.example/api/${path}`, {
        method,
        headers: {
          ...(auth ? { Authorization: `Bearer ${token}` } : {}),
          ...(value ? { "Content-Type": "application/json" } : {}),
          ...(tag ? { "If-Match": tag } : {}),
        },
        ...(value ? { body: JSON.stringify(value) } : {}),
      }),
      { DB, API_TOKEN: token },
    );
    return {
      status: response.status,
      tag: response.headers.get("etag"),
      headers: response.headers,
      body: await response.json(),
    };
  }
  return { DB, call };
}
test("24 authored profiles cover every style, preserve seeded flavour identities and validate", () => {
  assert.equal(presets.length, 24);
  assert.equal(new Set(presets.map((entry) => entry.id)).size, 24);
  for (const entry of presets) assert.deepEqual(validateFlavor(entry.profile), entry.profile);
  for (const style of Object.keys(FLAVOR_STYLES))
    assert.ok(
      presets.some((entry) => entry.profile.styles.includes(style)),
      style,
    );
  for (const file of ["catalogue.json", "exploration-pack.json"]) {
    const pack = JSON.parse(readFileSync(new URL(`../examples/${file}`, import.meta.url), "utf8"));
    for (const { recipe } of pack.recipes)
      assert.ok(
        presets.some((entry) => entry.id === recipe.flavor),
        recipe.flavor,
      );
  }
});
test("style, taste and ingredient search use readable labels without changing a profile", () => {
  const entry = { ...presets.find((entry) => entry.id === "teriyaki"), origin: "builtin" };
  assert.ok(matchesFlavor(entry, "sweet soy", "japanese"));
  assert.ok(!matchesFlavor(entry, "", "italian"));
  assert.ok(!matchesFlavor(entry, "", "mine"));
  assert.ok(matchesFlavor({ ...entry, origin: "custom" }, "glaze", "mine"));
  assert.equal(flavorName("teriyaki", [entry]), "Teriyaki glaze");
  assert.equal(flavorName("legacy_lemon-thyme", []), "Legacy Lemon Thyme");
});
test("profile validation rejects invalid styles, unknown fields, repeated ingredients and oversized text", () => {
  for (const patch of [
    { styles: ["not-a-style"] },
    { applications: ["automatic-recipe"] },
    { name: "x".repeat(121) },
    { tasteTags: ["Herby", "herby"] },
    {
      keyIngredients: [
        { name: "dill", ingredientId: null },
        { name: "Dill", ingredientId: null },
      ],
    },
    {
      keyIngredients: [
        { name: "dill", ingredientId: "dill" },
        { name: "herb", ingredientId: "dill" },
      ],
    },
    { ingredientQuantities: [20] },
    { origin: "builtin" },
  ])
    assert.throws(() => validateFlavor({ ...makeProfile(), ...patch }));
});
test("profile API is protected, paginated, validates queries and does not cache", async (t) => {
  const { call } = setup(t);
  assert.equal((await call("flavor-profiles", "GET", undefined, undefined, false)).status, 401);
  const first = await call("flavor-profiles?limit=1");
  assert.equal(first.status, 200);
  assert.equal(first.body.data.items.length, 1);
  assert.match(first.headers.get("cache-control"), /no-store/);
  const second = await call(`flavor-profiles?limit=1&after=${first.body.data.nextAfter}`);
  assert.notEqual(first.body.data.items[0].id, second.body.data.items[0].id);
  for (const query of ["limit=999", "limit=0", "limit=1&limit=2", "mystery=yes"])
    assert.equal((await call(`flavor-profiles?${query}`)).status, 400);
});
test("custom profiles generate IDs, survive reads and use optimistic concurrency", async (t) => {
  const { call } = setup(t);
  const created = await call("flavor-profiles", "POST", { profile: makeProfile() });
  assert.equal(created.status, 201);
  assert.match(created.body.data.id, /^custom-/);
  assert.equal(created.body.data.origin, "custom");
  const path = `flavor-profiles/${created.body.data.id}`;
  const read = await call(path);
  assert.deepEqual(read.body.data, created.body.data);
  const changed = { ...makeProfile(), name: "My brighter lemon dressing" };
  assert.equal((await call(path, "PUT", changed)).status, 428);
  const saved = await call(path, "PUT", changed, read.tag);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.revision, 2);
  assert.equal((await call(path, "PUT", changed, read.tag)).status, 412);
  assert.equal((await call(path, "DELETE")).status, 405);
});
test("builtins cannot be edited and existing profile IDs cannot be overwritten", async (t) => {
  const { call } = setup(t);
  const read = await call("flavor-profiles/ginger-sesame");
  assert.equal(
    (await call("flavor-profiles/ginger-sesame", "PUT", makeProfile(), read.tag)).status,
    400,
  );
  assert.equal(
    (await call("flavor-profiles", "POST", { id: "ginger-sesame", profile: makeProfile() })).status,
    409,
  );
  assert.deepEqual((await call("flavor-profiles/ginger-sesame")).body.data, read.body.data);
});
test("custom ingredient references must exist, while explicit label-only notes work in an empty kitchen", async (t) => {
  const { DB, call } = setup(t);
  assert.equal(
    (
      await call("flavor-profiles", "POST", {
        profile: { ...makeProfile(), keyIngredients: [{ name: "Dill", ingredientId: "dill" }] },
      })
    ).status,
    422,
  );
  assert.equal((await call("flavor-profiles", "POST", { profile: makeProfile() })).status, 201);
  assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM kitchen_ingredients").get().n, 0);
  assert.equal(
    (
      await call("ingredients", "POST", {
        id: "dill",
        ingredient: { name: "Fresh dill", aliases: [], components: [] },
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await call("flavor-profiles", "POST", {
        profile: { ...makeProfile(), keyIngredients: [{ name: "Dill", ingredientId: "dill" }] },
      })
    ).status,
    201,
  );
});
test("a legacy flavour can be described without revising any recipe, favourite or remix", async (t) => {
  const { DB, call } = setup(t);
  for (const entry of catalogue.ingredients)
    DB.sqlite
      .prepare("INSERT INTO kitchen_ingredients(id,document) VALUES(?,?)")
      .run(entry.id, JSON.stringify(entry.ingredient));
  const recipe = { ...catalogue.recipes[0].recipe, flavor: "my-imported-seasoning" };
  assert.equal((await call("recipes", "POST", { id: "legacy", recipe })).status, 201);
  await call("favourites/legacy", "PUT", { recipeRevision: 1, portions: 3 });
  const before = DB.sqlite.prepare("SELECT * FROM kitchen_recipes").all();
  const favourites = DB.sqlite.prepare("SELECT * FROM kitchen_favourites").all();
  const profile = await call("flavor-profiles", "POST", {
    id: recipe.flavor,
    profile: makeProfile(),
  });
  assert.equal(profile.status, 201);
  assert.deepEqual(DB.sqlite.prepare("SELECT * FROM kitchen_recipes").all(), before);
  assert.deepEqual(DB.sqlite.prepare("SELECT * FROM kitchen_favourites").all(), favourites);
  assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM kitchen_remixes").get().n, 0);
  assert.equal((await call("recipes/legacy")).body.data.recipe.flavor, recipe.flavor);
});
test("flavour metadata never replaces ingredient exclusions or authorises a recipe remix", () => {
  const a = structuredClone(catalogue.recipes[0].recipe);
  const b = { ...a, flavor: "teriyaki" };
  assert.equal(variationAxis(a, b), "flavor");
  assert.deepEqual(a.servings, b.servings);
  const preferences = {
    likedIngredientIds: [],
    excludedIngredientIds: ["soy"],
    defaultDinnerPortions: 3,
    defaultBreakfastPortions: 1,
    maxMinutes: null,
  };
  assert.equal(
    assessMeal(
      b,
      { mode: "dinner", portions: 3, maxMinutes: null, requiredIngredient: null },
      preferences,
      ingredientResolver(catalogue.ingredients),
    ).reason,
    "excluded-ingredient",
  );
});
test("new migrations and seed preserve a populated kitchen and are in one generated snapshot chain", (t) => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec("PRAGMA foreign_keys=ON");
  const dir = new URL("../drizzle/migrations/", import.meta.url);
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of names.filter((name) => name < "0006"))
    db.exec(readFileSync(new URL(name, dir), "utf8"));
  for (const entry of catalogue.recipes)
    db.prepare("INSERT INTO kitchen_recipes(id,document) VALUES(?,?)").run(
      entry.id,
      JSON.stringify(entry.recipe),
    );
  db.exec(
    "INSERT INTO kitchen_remixes(id,source_id,target_id,source_revision,target_revision,axis) VALUES('retained','D01','D03',1,1,'flavor');",
  );
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'kitchen_%'")
    .all();
  const before = tables.map(({ name }) => [
    name,
    db.prepare(`SELECT * FROM ${name} ORDER BY 1`).all(),
  ]);
  for (const name of names.filter((name) => name >= "0006"))
    db.exec(readFileSync(new URL(name, dir), "utf8"));
  for (const [name, rows] of before)
    assert.deepEqual(db.prepare(`SELECT * FROM ${name} ORDER BY 1`).all(), rows);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  const actual = db
    .prepare("SELECT id,document,origin FROM kitchen_flavor_profiles ORDER BY id")
    .all();
  assert.deepEqual(
    actual.map((row) => ({ id: row.id, profile: JSON.parse(row.document) })),
    [...presets].sort((a, b) => a.id.localeCompare(b.id)),
  );
  db.exec(readFileSync(new URL("0007_seed_flavor_profiles.sql", dir), "utf8"));
  assert.equal(db.prepare("SELECT count(*) AS n FROM kitchen_flavor_profiles").get().n, 24);
  const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", dir), "utf8"));
  const snapshots = journal.entries.map((entry) =>
    JSON.parse(
      readFileSync(
        new URL(`meta/${String(entry.idx).padStart(4, "0")}_snapshot.json`, dir),
        "utf8",
      ),
    ),
  );
  for (let i = 1; i < snapshots.length; i++) assert.equal(snapshots[i].prevId, snapshots[i - 1].id);
  assert.ok(snapshots.at(-1).tables.kitchen_flavor_profiles);
  assert.deepEqual(snapshots.at(-1).tables, snapshots.at(-2).tables);
});
