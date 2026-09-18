/// <reference types="@cloudflare/workers-types" />
declare global {
  interface CloudflareEnv {
    DB: D1Database;
    API_TOKEN?: string;
    ALLOWED_ORIGIN?: string;
    ASSETS: Fetcher;
    WORKER_SELF_REFERENCE: Fetcher;
  }
}
export {};
