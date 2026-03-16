import { Hono } from "hono";
import { buildCalendar } from "../ics/renderer.js";
import { TimelineDatabase } from "../db/sqlite.js";
import { sourceManifest } from "../sources/manifest.js";
import { config } from "../config.js";
import { type SourceMetadata } from "../types.js";

const hydrateManifest = (db: TimelineDatabase) => {
  db.seedDataIfEmpty(
    sourceManifest.map((entry: (typeof sourceManifest)[number]) => ({
      id: entry.id,
      vendor: entry.vendor,
      name: entry.name,
      url: entry.url,
      parser: entry.parser,
      defaultCategory: entry.defaultCategory ?? "blog_update",
      cooldownSeconds: entry.cooldownSeconds ?? 3600,
    }))
  );
};

const clampLimit = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 200);
};

const normalizeCursor = (value: string | undefined) => (value?.trim() ? value.trim() : null);

export const createApp = (db: TimelineDatabase) => {
  hydrateManifest(db);
  const app = new Hono();

  app.get("/healthz", async (c) => {
    try {
      const status = db.getDbHealth();
      return c.json({
        ok: true,
        database: status,
        environment: {
          host: config.host,
          port: config.port,
          apiBase: config.apiBase,
          databasePath: config.databasePath,
        },
      });
    } catch (error) {
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  app.get("/sources", (c) => {
    return c.json({
      sources: db.listSources().map((entry: SourceMetadata) => ({
        id: entry.source.id,
        vendor: entry.source.vendor,
        name: entry.source.name,
        url: entry.source.url,
        parser: entry.source.parser,
        enabled: entry.source.enabled,
        default_category: entry.source.default_category,
        cooldown_seconds: entry.source.cooldown_seconds,
        etag: entry.source.etag,
        last_modified: entry.source.last_modified,
        last_fetched_at: entry.source.last_fetched_at,
        last_success_at: entry.source.last_success_at,
        last_error: entry.source.last_error,
        last_fetch_run: entry.last_fetch_run,
      })),
    });
  });

  app.get("/events", (c) => {
    const query = c.req.query();
    const filters = {
      vendor: query.vendor ?? null,
      category: query.category ?? null,
      product: query.product ?? null,
      model: query.model ?? null,
      since: query.since ?? null,
      until: query.until ?? null,
      cursor: normalizeCursor(query.cursor),
      limit: clampLimit(query.limit, 50),
    };

    const result = db.getEvents(filters);
    return c.json({
      data: result.events,
      has_more: result.hasMore,
      next_cursor: result.nextCursor,
      limit: filters.limit,
    });
  });

  app.get("/events/:id", (c) => {
    const id = c.req.param("id");
    const event = db.getEventById(id);
    if (!event) return c.json({ error: "not found" }, 404);
    return c.json(event);
  });

  app.get("/calendar.ics", (c) => {
    const query = c.req.query();
    const filters = {
      vendor: query.vendor ?? null,
      category: query.category ?? null,
      product: query.product ?? null,
      model: query.model ?? null,
      since: query.since ?? null,
      until: query.until ?? null,
      cursor: null,
      limit: 500,
    };
    const result = db.getEvents(filters);
    const payload = buildCalendar(result.events);
    const queryString = new URLSearchParams(
      Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined)
    ).toString();
    const source = queryString ? `?${queryString}` : "";
    return c.body(payload, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename=\"calendar${source ? "-filtered" : ""}.ics\"`,
      },
    });
  });

  return app;
};
