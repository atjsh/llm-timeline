import process from "node:process";

export const config = {
  host: process.env.HOST ?? "0.0.0.0",
  databasePath: process.env.DATABASE_PATH ?? "data/timeline.db",
  port: Number(process.env.PORT ?? 3000),
  apiBase: process.env.API_BASE_URL ?? "http://localhost:3000",
  backfillDefaultSince: process.env.BACKFILL_SINCE ?? "2020-01-01",
  maxFetchConcurrency: Number(process.env.MAX_FETCH_CONCURRENCY ?? 2),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 20000),
};
