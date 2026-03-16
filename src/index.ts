import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { createApp } from "./api/index.js";
import { TimelineDatabase } from "./db/sqlite.js";

const db = new TimelineDatabase(config.databasePath);
const app = createApp(db);

serve({
  fetch: app.fetch,
  port: config.port,
  hostname: config.host,
});

console.info(`llm-timeline API listening on ${config.host}:${config.port} (${config.apiBase})`);
