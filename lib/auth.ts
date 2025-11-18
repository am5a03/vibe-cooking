import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "@/db";

// This will be initialized with the Cloudflare D1 database binding
export function getAuth(db: D1Database) {
  return betterAuth({
    database: drizzleAdapter(getDb(db), {
      provider: "sqlite",
    }),
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      },
    },
    secret: process.env.BETTER_AUTH_SECRET || "",
  });
}
