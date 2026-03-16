import { Hono } from "hono";
import { buildCalendar } from "../ics/renderer.js";
import { TimelineDatabase } from "../db/sqlite.js";
import { sourceManifest } from "../sources/manifest.js";
import { config } from "../config.js";
import {
  ALLOWED_CATEGORIES,
  ALLOWED_VENDORS,
  type EventCategory,
  type SourceMetadata,
  type Vendor,
} from "../types.js";
import { renderFeedsPage, renderTimelineItems, type FeedsPageState } from "../html/feeds.js";

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

const normalizeSearchValue = (value: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const normalizeCursor = (value: string | undefined) => (value?.trim() ? value.trim() : null);

const parseCursorPayload = (value: string | null) => {
  if (!value) return null;
  try {
    let parsed: unknown = JSON.parse(Buffer.from(value, "base64").toString());
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "eventDate" in parsed &&
      "id" in parsed &&
      typeof parsed.eventDate === "string" &&
      typeof parsed.id === "string"
    ) {
      return {
        eventDate: parsed.eventDate,
        id: parsed.id,
      };
    }
  } catch {
    // Invalid cursors are rejected by the fragment route.
  }
  return null;
};

const normalizeCursorValue = (value: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const readMultiSelect = <T extends string>(
  searchParams: URLSearchParams,
  key: string,
  allowedValues: readonly T[]
) => {
  const selected = new Set<T>();
  for (const rawValue of searchParams.getAll(key)) {
    for (const part of rawValue.split(",")) {
      const candidate = part.trim();
      if (!candidate || candidate === "all") continue;
      if ((allowedValues as readonly string[]).includes(candidate)) {
        selected.add(candidate as T);
      }
    }
  }
  return [...selected] as T[];
};

type EventFilters = {
  vendor: Vendor[] | null;
  category: EventCategory[] | null;
  product: string | null;
  model: string | null;
  since: string | null;
  until: string | null;
  cursor: string | null;
  limit: number;
};

const appendMultiValueParams = (params: URLSearchParams, key: string, values: string[] | null) => {
  if (!values?.length) {
    params.append(key, "all");
    return;
  }
  for (const value of values) {
    params.append(key, value);
  }
};

const buildApiHref = (
  path: string,
  filters: EventFilters,
  options: { includeCursor?: boolean; includeLimit?: boolean; preserveEmptySelects?: boolean } = {}
) => {
  const params = new URLSearchParams();
  if (options.preserveEmptySelects) {
    appendMultiValueParams(params, "vendor", filters.vendor);
    appendMultiValueParams(params, "category", filters.category);
  } else {
    for (const vendor of filters.vendor ?? []) params.append("vendor", vendor);
    for (const category of filters.category ?? []) params.append("category", category);
  }
  if (filters.product) params.set("product", filters.product);
  if (filters.model) params.set("model", filters.model);
  if (filters.since) params.set("since", filters.since);
  if (filters.until) params.set("until", filters.until);
  if (options.includeLimit) params.set("limit", String(filters.limit));
  if (options.includeCursor && filters.cursor) params.set("cursor", filters.cursor);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};

const readFeedsPageState = (searchParams: URLSearchParams): FeedsPageState => ({
  vendors: searchParams.has("vendor") ? readMultiSelect(searchParams, "vendor", ALLOWED_VENDORS) : [],
  categories: searchParams.has("category")
    ? readMultiSelect(searchParams, "category", ALLOWED_CATEGORIES)
    : ["model_release"],
  product: searchParams.get("product")?.trim() ?? "",
  model: searchParams.get("model")?.trim() ?? "",
  since: searchParams.get("since")?.trim() ?? "",
  until: searchParams.get("until")?.trim() ?? "",
  limit: clampLimit(searchParams.get("limit") ?? undefined, 50),
  cursor: normalizeCursorValue(searchParams.get("cursor")) ?? "",
});

const feedsStateToEventFilters = (state: FeedsPageState): EventFilters => ({
  vendor: state.vendors.length ? state.vendors : null,
  category: state.categories.length ? state.categories : null,
  product: normalizeQueryValue(state.product),
  model: normalizeQueryValue(state.model),
  since: normalizeQueryValue(state.since),
  until: normalizeQueryValue(state.until),
  cursor: normalizeCursor(state.cursor),
  limit: state.limit,
});

const readEventFilters = (searchParams: URLSearchParams): EventFilters => ({
  vendor: searchParams.has("vendor") ? readMultiSelect(searchParams, "vendor", ALLOWED_VENDORS) : null,
  category: searchParams.has("category") ? readMultiSelect(searchParams, "category", ALLOWED_CATEGORIES) : null,
  product: normalizeSearchValue(searchParams.get("product")),
  model: normalizeSearchValue(searchParams.get("model")),
  since: normalizeSearchValue(searchParams.get("since")),
  until: normalizeSearchValue(searchParams.get("until")),
  cursor: normalizeCursorValue(searchParams.get("cursor")),
  limit: clampLimit(searchParams.get("limit") ?? undefined, 50),
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
    const searchParams = new URL(c.req.url).searchParams;
    const filters = readEventFilters(searchParams);

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
    const searchParams = new URL(c.req.url).searchParams;
    const pageState = readFeedsPageState(searchParams);
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
      itemsHref: buildApiHref("/feeds/items", { ...filters, cursor: null }, { includeLimit: true, preserveEmptySelects: true }),
    });
    return c.body(payload, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  });

  app.get("/feeds/items", (c) => {
    const searchParams = new URL(c.req.url).searchParams;
    const pageState = readFeedsPageState(searchParams);
    const filters = feedsStateToEventFilters(pageState);
    if (!filters.cursor || !parseCursorPayload(filters.cursor)) {
      return c.json({ error: "valid cursor is required" }, 400);
    }
    const result = db.getEvents(filters);
    return c.json({
      html: renderTimelineItems(result.events),
      has_more: result.hasMore,
      next_cursor: result.nextCursor,
      returned_count: result.events.length,
    });
  });

  app.get("/calendar.ics", (c) => {
    const searchParams = new URL(c.req.url).searchParams;
    const filters = {
      ...readEventFilters(searchParams),
      cursor: null,
      limit: 500,
    };
    const result = db.getEvents(filters);
    const payload = buildCalendar(result.events);
    const queryString = searchParams.toString();
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
