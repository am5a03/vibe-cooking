/// <reference types="@cloudflare/workers-types" />

declare global {
  interface CloudflareEnv {
    DB: D1Database;
    R2: R2Bucket;
    AI: Ai;
  }
}

export {};
