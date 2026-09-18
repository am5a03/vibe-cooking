import type { Browser, BrowserContext } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Real server-issued cookies for screen tests, not repeated login tests.
 * Kept only in the disposable D1 runner state, never in screenshot artifacts.
 * Dedicated unlock/logout/expiry tests still exercise the authentication UI.
 */
export async function screenSession(
  browser: Browser,
  baseURL: string | undefined,
): Promise<Awaited<ReturnType<BrowserContext["cookies"]>>> {
  const key = process.env.KITCHEN_TEST_TOKEN;
  const state = process.env.KITCHEN_TEST_STATE;
  if (!key || !state || !baseURL) throw new Error("Use the isolated browser runner.");
  const path = join(state, "ui-phase3-cookies.json");
  const session = await browser.newContext({ baseURL });
  try {
    if (existsSync(path)) await session.addCookies(JSON.parse(readFileSync(path, "utf8")));
    const current = await session.request.get("/api/session");
    if (!current.ok()) throw new Error(`Session check failed (${current.status()}).`);
    if (!(await current.json()).data.authenticated) {
      const response = await session.request.post("/api/session", {
        headers: { Origin: new URL(baseURL).origin, "X-Kitchen-Request": "1" },
        data: { key },
      });
      if (!response.ok()) throw new Error(`Screen session creation failed (${response.status()}).`);
    }
    const cookies = await session.cookies();
    if (!cookies.some((cookie) => cookie.httpOnly))
      throw new Error("Missing HttpOnly test session.");
    writeFileSync(path, JSON.stringify(cookies), { mode: 0o600 });
    return cookies;
  } finally {
    await session.close();
  }
}
