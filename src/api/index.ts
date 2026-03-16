import { Hono } from "hono";
import { buildCalendar } from "../ics/renderer.js";
import { TimelineDatabase } from "../db/sqlite.js";
import { sourceManifest } from "../sources/manifest.js";
import { config } from "../config.js";
import { type SourceMetadata } from "../types.js";
import { renderFeedsPage, type FeedsPageState } from "../html/feeds.js";

const hydrateManifest = (db: TimelineDatabase) => {
  db.seedDataIfEmpty(
    sourceManifest.map((entry: (typeof sourceManifest)[number]) => ({
      id: entry.id,
      vendor: entry.vendor,
      name: entry.name,
      url: entry.url,
      parser: entry.parser,
      enabled: entry.enabled ?? true,
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

const normalizeQueryValue = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const normalizeCursor = (value: string | undefined) => (value?.trim() ? value.trim() : null);

const hasQueryKey = (query: Record<string, string | undefined>, key: string) =>
  Object.prototype.hasOwnProperty.call(query, key);

const normalizePageSelect = (value: string | undefined, fallback: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
};

const buildApiHref = (
  path: string,
  filters: {
    vendor: string | null;
    category: string | null;
    product: string | null;
    model: string | null;
    since: string | null;
    until: string | null;
    cursor: string | null;
    limit: number;
  },
  options: { includeCursor?: boolean; includeLimit?: boolean } = {}
) => {
  const params = new URLSearchParams();
  if (filters.vendor) params.set("vendor", filters.vendor);
  if (filters.category) params.set("category", filters.category);
  if (filters.product) params.set("product", filters.product);
  if (filters.model) params.set("model", filters.model);
  if (filters.since) params.set("since", filters.since);
  if (filters.until) params.set("until", filters.until);
  if (options.includeLimit) params.set("limit", String(filters.limit));
  if (options.includeCursor && filters.cursor) params.set("cursor", filters.cursor);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};

const readFeedsPageState = (query: Record<string, string | undefined>): FeedsPageState => ({
  vendor: normalizePageSelect(query.vendor, "all"),
  category: hasQueryKey(query, "category") ? normalizePageSelect(query.category, "all") : "model_release",
  product: query.product?.trim() ?? "",
  model: query.model?.trim() ?? "",
  since: query.since?.trim() ?? "",
  until: query.until?.trim() ?? "",
  limit: clampLimit(query.limit, 50),
  cursor: normalizeCursor(query.cursor) ?? "",
});

const feedsStateToEventFilters = (state: FeedsPageState) => ({
  vendor: state.vendor === "all" ? null : normalizeQueryValue(state.vendor),
  category: state.category === "all" ? null : normalizeQueryValue(state.category),
  product: normalizeQueryValue(state.product),
  model: normalizeQueryValue(state.model),
  since: normalizeQueryValue(state.since),
  until: normalizeQueryValue(state.until),
  cursor: normalizeCursor(state.cursor),
  limit: state.limit,
});

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

  app.get("/feeds", (c) => {
    const pageState = readFeedsPageState(c.req.query());
    const filters = feedsStateToEventFilters(pageState);
    const result = db.getEvents(filters);
    const payload = renderFeedsPage({
      events: result.events,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
      state: pageState,
      eventsJsonHref: buildApiHref("/events", filters, { includeCursor: true, includeLimit: true }),
      calendarHref: buildApiHref("/calendar.ics", filters),
      sourcesHref: "/sources",
    });
    return c.body(payload, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
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
