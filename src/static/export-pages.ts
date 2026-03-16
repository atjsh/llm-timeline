import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { TimelineDatabase } from "../db/sqlite.js";
import {
  createStaticFeedsEventSnapshot,
  renderStaticFeedsPage,
  type FeedsPageState,
  type StaticFeedsEventSnapshot,
} from "../html/feeds.js";
import type { EventRow } from "../types.js";

export interface StaticFeedsExportPayload {
  exported_at: string;
  events: StaticFeedsEventSnapshot[];
}

export interface ExportPagesOptions {
  db: TimelineDatabase;
  outDir?: string;
}

export interface ExportPagesResult {
  outDir: string;
  eventCount: number;
  exportedAt: string;
  files: string[];
}

const defaultState: FeedsPageState = {
  vendors: [],
  categories: ["model_release"],
  product: "",
  model: "",
  since: "",
  until: "",
  limit: 50,
  cursor: "",
};

const exportPageSize = 200;

const filterEventsForState = (events: EventRow[], state: FeedsPageState) =>
  events.filter((event) => {
    if (state.vendors.length && !state.vendors.includes(event.vendor)) return false;
    if (state.categories.length && !state.categories.includes(event.category)) return false;
    if (state.product && !event.products.includes(state.product)) return false;
    if (state.model && !event.models.includes(state.model)) return false;
    if (state.since && event.event_date < state.since) return false;
    if (state.until && event.event_date > state.until) return false;
    return true;
  });

const collectAllEvents = (db: TimelineDatabase) => {
  const events: EventRow[] = [];
  let cursor: string | null = null;

  for (;;) {
    const page = db.getEvents({
      vendor: null,
      category: null,
      product: null,
      model: null,
      since: null,
      until: null,
      cursor,
      limit: exportPageSize,
    });
    events.push(...page.events);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }

  return events;
};

const renderIndexHtml = () => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LLM Feeds Snapshot</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f3efe6;
        --panel: #fffdf8;
        --ink: #1f1a16;
        --muted: #6f675f;
        --line: #d6cdbf;
        --accent: #9d5b3b;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(circle at top left, rgba(157, 91, 59, 0.14), transparent 30%),
          linear-gradient(180deg, #f7f3ea 0%, var(--bg) 100%);
        color: var(--ink);
        font-family: "Georgia", "Times New Roman", serif;
      }

      main {
        max-width: 40rem;
        padding: 28px;
        border-radius: 24px;
        background: rgba(255, 253, 248, 0.92);
        border: 1px solid rgba(214, 205, 191, 0.9);
        text-align: center;
      }

      p {
        color: var(--muted);
        line-height: 1.6;
      }

      a {
        display: inline-flex;
        min-height: 42px;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 0 16px;
        color: inherit;
        text-decoration: none;
        background: rgba(157, 91, 59, 0.12);
        border: 1px solid rgba(157, 91, 59, 0.24);
      }
    </style>
    <meta http-equiv="refresh" content="0; url=./feeds/" />
  </head>
  <body>
    <main>
      <h1>LLM Feeds Snapshot</h1>
      <p>Redirecting to the static timeline preview.</p>
      <p><a href="./feeds/">Open the feed snapshot</a></p>
    </main>
    <script>
      const target = new URL("./feeds/", window.location.href);
      target.search = window.location.search;
      target.hash = window.location.hash;
      window.location.replace(target.toString());
    </script>
  </body>
</html>`;

export const exportPages = ({ db, outDir = "docs" }: ExportPagesOptions): ExportPagesResult => {
  const resolvedOutDir = resolve(process.cwd(), outDir);
  const feedsDir = join(resolvedOutDir, "feeds");
  const assetsDir = join(resolvedOutDir, "assets");
  const exportedAt = new Date().toISOString();
  const events = collectAllEvents(db);
  const staticPayload: StaticFeedsExportPayload = {
    exported_at: exportedAt,
    events: events.map((event) => createStaticFeedsEventSnapshot(event)),
  };
  const defaultEvents = filterEventsForState(events, defaultState);
  const initialEvents = defaultEvents.slice(0, defaultState.limit);

  mkdirSync(feedsDir, { recursive: true });
  mkdirSync(assetsDir, { recursive: true });

  writeFileSync(join(resolvedOutDir, "index.html"), renderIndexHtml(), "utf8");
  writeFileSync(join(resolvedOutDir, ".nojekyll"), "", "utf8");
  writeFileSync(join(assetsDir, "events.json"), `${JSON.stringify(staticPayload, null, 2)}\n`, "utf8");
  writeFileSync(
    join(feedsDir, "index.html"),
    renderStaticFeedsPage({
      events: initialEvents,
      hasMore: defaultEvents.length > initialEvents.length,
      state: defaultState,
      dataHref: "../assets/events.json",
      homeHref: "../",
      exportedAt,
    }),
    "utf8"
  );

  return {
    outDir: resolvedOutDir,
    eventCount: events.length,
    exportedAt,
    files: [
      join(resolvedOutDir, "index.html"),
      join(resolvedOutDir, ".nojekyll"),
      join(assetsDir, "events.json"),
      join(feedsDir, "index.html"),
    ],
  };
};
