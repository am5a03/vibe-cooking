import { and, eq, gt } from "drizzle-orm";
import type { KitchenDb } from "../../db/index.ts";
import { flavorProfiles } from "../../db/schema.ts";
import { ApiError, requireThat } from "./errors.ts";
import { body, checkRevision, etag } from "./http.ts";
import { checkIngredients, revisionChanged } from "./store.ts";
import { validateFlavor, type FlavorEntry } from "./flavors.ts";
import * as V from "./validation.ts";

function decode(row: typeof flavorProfiles.$inferSelect): FlavorEntry {
  return {
    id: row.id,
    origin: row.origin,
    revision: row.revision,
    profile: validateFlavor(JSON.parse(row.document)),
  };
}
// Called only after the shared authentication, origin, session and DB checks.
export async function flavorRoute(request: Request, db: KitchenDb) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");
  const match = /^\/api\/flavor-profiles\/([^/]+)$/.exec(path);
  if (path !== "/api/flavor-profiles" && !match) return null;
  if (request.method === "GET" && !match) {
    for (const key of url.searchParams.keys())
      requireThat(
        ["limit", "after"].includes(key) && url.searchParams.getAll(key).length === 1,
        "Unsupported or repeated profile filter.",
      );
    const limit = V.integer(Number(url.searchParams.get("limit") ?? 100), "limit", 1, 100);
    const after = url.searchParams.get("after") || "";
    if (after) V.id(after);
    const rows = await db
      .select()
      .from(flavorProfiles)
      .where(gt(flavorProfiles.id, after))
      .orderBy(flavorProfiles.id)
      .limit(limit + 1);
    return {
      data: {
        items: rows.slice(0, limit).map(decode),
        nextAfter: rows.length > limit ? rows[limit - 1].id : null,
      },
      status: 200,
    };
  }
  if (request.method === "POST" && !match) {
    const input = V.record(await body(request));
    V.keys(input, ["id", "profile"], "body");
    // Explicit IDs are supported for enriching an imported legacy reference. Normal UI creation generates one automatically.
    const id = input.id === undefined ? `custom-${crypto.randomUUID()}` : V.id(input.id);
    const profile = validateFlavor(input.profile);
    await checkIngredients(
      db,
      profile.keyIngredients.flatMap((item) =>
        item.ingredientId === null ? [] : [item.ingredientId],
      ),
    );
    const rows = await db
      .insert(flavorProfiles)
      .values({ id, document: JSON.stringify(profile), origin: "custom" })
      .onConflictDoNothing()
      .returning();
    if (!rows.length)
      throw new ApiError(
        409,
        "ALREADY_EXISTS",
        "This profile already exists. Reload the library; no profile was replaced.",
      );
    return { data: decode(rows[0]), status: 201, tag: etag("flavor", id, 1) };
  }
  if (match) {
    const id = V.id(match[1]);
    const [row] = await db.select().from(flavorProfiles).where(eq(flavorProfiles.id, id));
    if (!row) throw new ApiError(404, "NOT_FOUND", "Flavour profile not found.");
    if (request.method === "GET")
      return { data: decode(row), status: 200, tag: etag("flavor", id, row.revision) };
    if (request.method === "PUT") {
      requireThat(
        row.origin === "custom",
        "Built-in combinations are read-only. Make your own combination instead.",
      );
      checkRevision(request, "flavor", id, row.revision);
      const profile = validateFlavor(await body(request));
      await checkIngredients(
        db,
        profile.keyIngredients.flatMap((item) =>
          item.ingredientId === null ? [] : [item.ingredientId],
        ),
      );
      const rows = await db
        .update(flavorProfiles)
        .set({
          document: JSON.stringify(profile),
          revision: row.revision + 1,
          updatedAt: new Date().toISOString(),
        })
        .where(and(eq(flavorProfiles.id, id), eq(flavorProfiles.revision, row.revision)))
        .returning();
      revisionChanged(rows);
      return { data: decode(rows[0]), status: 200, tag: etag("flavor", id, row.revision + 1) };
    }
  }
  throw new ApiError(
    405,
    "METHOD_NOT_ALLOWED",
    "Use GET, POST or PUT. Profiles are not deleted because recipes may reference them.",
  );
}
