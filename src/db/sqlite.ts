import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  ALLOWED_CATEGORIES,
  type EventCategory,
  type EventRow,
  type FetchRun,
  type RawItem,
  type StoredRawItem,
  type SourceMetadata,
  type SourceRow,
  type Vendor,
} from "../types.js";

const toJson = (value: string[]) => JSON.stringify(value);

const parseDate = () => new Date().toISOString();

const normalizeString = (value: string) => {
  return JSON.stringify(value);
};

type DbSourceListRow = SourceMetadata["source"] & {
  run_id?: number;
  run_started_at?: string;
  run_status?: FetchRun["status"];
  run_fetched_count?: number;
  run_inserted_count?: number;
  run_updated_count?: number;
  run_error?: string;
};

export class TimelineDatabase {
  private db: DatabaseSync;

  constructor(private dbPath: string) {
    mkdirSync(dirname(this.path()), { recursive: true });
    this.db = new DatabaseSync(this.path());
    this.migrate();
  }

  private path() {
    if (this.dbPath === ":memory:") return this.dbPath;
    return this.dbPath.startsWith("/") ? this.dbPath : join(process.cwd(), this.dbPath);
  }

  private migrate() {
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        vendor TEXT NOT NULL,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        parser TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        default_category TEXT NOT NULL,
        cooldown_seconds INTEGER NOT NULL DEFAULT 3600,
        etag TEXT,
        last_modified TEXT,
        last_fetched_at TEXT,
        last_success_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fetch_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL CHECK(status IN ('running', 'success', 'error')),
        fetched_count INTEGER NOT NULL DEFAULT 0,
        inserted_count INTEGER NOT NULL DEFAULT 0,
        updated_count INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS raw_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT NOT NULL,
        external_id TEXT NOT NULL,
        title TEXT NOT NULL,
        canonical_url TEXT NOT NULL,
        summary TEXT NOT NULL,
        published_at TEXT,
        fetched_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        checksum TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(source_id, external_id),
        FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        raw_item_id INTEGER NOT NULL,
        source_priority INTEGER NOT NULL DEFAULT 0,
        vendor TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN (${ALLOWED_CATEGORIES.map((c) => `'${c}'`).join(",")})),
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        canonical_url TEXT NOT NULL,
        normalized_anchor TEXT NOT NULL,
        evidence_url TEXT NOT NULL,
        evidence_excerpt TEXT NOT NULL,
        published_at TEXT,
        event_date TEXT NOT NULL,
        event_date_kind TEXT NOT NULL,
        date_precision TEXT NOT NULL,
        products TEXT NOT NULL DEFAULT '[]',
        models TEXT NOT NULL DEFAULT '[]',
        tags TEXT NOT NULL DEFAULT '[]',
        last_seen_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE,
        FOREIGN KEY(raw_item_id) REFERENCES raw_items(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_events_sort ON events(event_date DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_events_vendor ON events(vendor);
      CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
    `);

    // Add nullable columns if we need to evolve schema from prior states.
    const columns = this.db.prepare("PRAGMA table_info(sources)").all() as { name: string }[];
    const hasLastRun = columns.some((row) => row.name === "last_fetch_run_id");
    if (!hasLastRun) {
      this.db.exec("ALTER TABLE sources ADD COLUMN last_fetch_run_id INTEGER;");
    }

    const eventColumns = this.db.prepare("PRAGMA table_info(events)").all() as { name: string }[];
    const hasSourcePriority = eventColumns.some((row) => row.name === "source_priority");
    if (!hasSourcePriority) {
      this.db.exec("ALTER TABLE events ADD COLUMN source_priority INTEGER NOT NULL DEFAULT 0;");
    }
  }

  get dbInstance() {
    return this.db;
  }

  upsertSources(entries: Array<{
    id: string;
    vendor: Vendor;
    name: string;
    url: string;
    parser: string;
    enabled?: boolean;
    defaultCategory?: EventCategory;
    default_category?: EventCategory;
    cooldownSeconds?: number;
    cooldown_seconds?: number;
  }>) {
    const existingStatement = this.db.prepare("SELECT url, parser FROM sources WHERE id = ?");
    const deleteSourceStatement = this.db.prepare("DELETE FROM sources WHERE id = ?");
    const statement = this.db.prepare(`
      INSERT INTO sources (
        id, vendor, name, url, parser, enabled, default_category, cooldown_seconds, created_at, updated_at
      ) VALUES (
        :id, :vendor, :name, :url, :parser, :enabled, :default_category, :cooldown_seconds, :created_at, :updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        vendor=excluded.vendor,
        name=excluded.name,
        url=excluded.url,
        parser=excluded.parser,
        default_category=excluded.default_category,
        cooldown_seconds=excluded.cooldown_seconds,
        enabled=excluded.enabled,
        updated_at=excluded.updated_at
    `);
    const now = parseDate();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const entry of entries) {
        const existing = existingStatement.get(entry.id) as { url: string; parser: string } | undefined;
        if (existing && (existing.url !== entry.url || existing.parser !== entry.parser)) {
          deleteSourceStatement.run(entry.id);
        }
        const defaultCategory: EventCategory = entry.defaultCategory ?? entry.default_category ?? "blog_update";
        const cooldownSeconds: number = entry.cooldownSeconds ?? entry.cooldown_seconds ?? 3600;
        statement.run({
          id: entry.id,
          vendor: entry.vendor,
          name: entry.name,
          url: entry.url,
          parser: entry.parser,
          enabled: entry.enabled === false ? 0 : 1,
          default_category: defaultCategory,
          cooldown_seconds: cooldownSeconds,
          created_at: now,
          updated_at: now,
        });
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listSources() {
    const rows = this.db.prepare(`
      SELECT
        s.id,
        s.vendor,
        s.name,
        s.url,
        s.parser,
        s.enabled,
        s.default_category,
        s.cooldown_seconds,
        s.etag,
        s.last_modified,
        s.last_fetched_at,
        s.last_success_at,
        s.last_error,
        s.created_at,
        s.updated_at,
        fr.id AS run_id,
        fr.started_at AS run_started_at,
        fr.status AS run_status,
        fr.fetched_count AS run_fetched_count,
        fr.inserted_count AS run_inserted_count,
        fr.updated_count AS run_updated_count,
        fr.error AS run_error
      FROM sources s
      LEFT JOIN (
        SELECT *
        FROM fetch_runs
        WHERE id IN (
          SELECT MAX(id) FROM fetch_runs GROUP BY source_id
        )
      ) fr ON fr.source_id = s.id
      ORDER BY s.vendor ASC, s.name ASC
    `).all() as unknown as DbSourceListRow[];

    return rows.map((row) => ({
      source: {
        id: row.id,
        vendor: row.vendor,
        name: row.name,
        url: row.url,
        parser: row.parser,
        enabled: !!row.enabled,
        default_category: row.default_category,
        cooldown_seconds: row.cooldown_seconds,
        etag: row.etag,
        last_modified: row.last_modified,
        last_fetched_at: row.last_fetched_at,
        last_success_at: row.last_success_at,
        last_error: row.last_error,
        created_at: row.created_at,
        updated_at: row.updated_at,
      } satisfies SourceMetadata["source"],
      last_fetch_run: row.run_id
        ? {
            id: row.run_id,
            started_at: row.run_started_at,
            status: row.run_status as FetchRun["status"],
            fetched_count: row.run_fetched_count,
            inserted_count: row.run_inserted_count,
            updated_count: row.run_updated_count,
            error: row.run_error,
          }
        : null,
    }));
  }

  getDueSources() {
    const rows = this.db.prepare(`
      SELECT
        id, vendor, name, url, parser, enabled, default_category, cooldown_seconds, etag, last_modified, last_fetched_at, last_success_at, last_error
      FROM sources
      WHERE enabled = 1
    `).all() as unknown as SourceRow[];
    const now = Date.now();
    return rows.filter((row) => {
      if (!row.last_fetched_at) return true;
      const last = Date.parse(row.last_fetched_at);
      return Number.isNaN(last) || now - last >= row.cooldown_seconds * 1000;
    });
  }

  getAllSources() {
    return this.db
      .prepare(
        `
        SELECT id, vendor, name, url, parser, enabled, default_category, cooldown_seconds, etag, last_modified, last_fetched_at, last_success_at, last_error
        FROM sources
        WHERE enabled = 1
        ORDER BY vendor ASC, name ASC
        `
      )
      .all() as unknown as SourceRow[];
  }

  startFetchRun(sourceId: string) {
    const startedAt = parseDate();
    const result = this.db
      .prepare(
        `
        INSERT INTO fetch_runs (source_id, started_at, status, fetched_count, inserted_count, updated_count)
        VALUES (?, ?, 'running', 0, 0, 0)
      `
      )
      .run(sourceId, startedAt);
    return Number(result.lastInsertRowid);
  }

  finishFetchRun(
    id: number,
    updates: { status: "success" | "error"; fetchedCount: number; insertedCount: number; updatedCount: number; error?: string | null }
  ) {
    const finished = parseDate();
    this.db.prepare(
      `
      UPDATE fetch_runs
      SET status = ?, finished_at = ?, fetched_count = ?, inserted_count = ?, updated_count = ?, error = ?
      WHERE id = ?
      `
    ).run(updates.status, finished, updates.fetchedCount, updates.insertedCount, updates.updatedCount, updates.error ?? null, id);
    this.db
      .prepare(
        `
        UPDATE sources
        SET last_fetched_at = ?, last_success_at = CASE WHEN ? = 'success' THEN ? ELSE last_success_at END, last_error = ?
        WHERE id = (SELECT source_id FROM fetch_runs WHERE id = ?)
      `
      )
      .run(finished, updates.status, finished, updates.error ?? null, id);
  }

  updateSourceMetadata(
    sourceId: string,
    metadata: { etag?: string | null; lastModified?: string | null; fetchRunId?: number }
  ) {
    this.db
      .prepare(
        `
        UPDATE sources
        SET etag = COALESCE(?, etag),
            last_modified = COALESCE(?, last_modified),
            last_fetch_run_id = ?
        WHERE id = ?
      `
      )
      .run(metadata.etag ?? null, metadata.lastModified ?? null, metadata.fetchRunId ?? null, sourceId);
  }

  getSource(sourceId: string): SourceRow | null {
    const row = this.db.prepare("SELECT * FROM sources WHERE id = ?").get(sourceId) as SourceRow | undefined;
    return row ?? null;
  }

  upsertRawItem(item: Omit<RawItem, "id">) {
    const now = parseDate();
    const existing = this.db
      .prepare("SELECT id, checksum FROM raw_items WHERE source_id = ? AND external_id = ?")
      .get(item.source_id, item.external_id) as { id: number; checksum: string } | undefined;
    if (!existing) {
      const result = this.db.prepare(
        `
        INSERT INTO raw_items (
          source_id, external_id, title, canonical_url, summary, published_at, fetched_at, payload_json, checksum, created_at, updated_at
        )
        VALUES (:source_id, :external_id, :title, :canonical_url, :summary, :published_at, :fetched_at, :payload_json, :checksum, :created_at, :updated_at)
        `
      ).run({
        source_id: item.source_id,
        external_id: item.external_id,
        title: item.title,
        canonical_url: item.canonical_url,
        summary: item.summary,
        published_at: item.published_at ?? null,
        fetched_at: item.fetched_at,
        payload_json: item.payload_json,
        checksum: item.checksum,
        created_at: now,
        updated_at: now,
      });
      return { rawItemId: Number(result.lastInsertRowid), changed: true, hadContentUpdate: true };
    }
    if (existing.checksum !== item.checksum) {
      this.db.prepare(
        `
        UPDATE raw_items
        SET title = :title, summary = :summary, published_at = :published_at, fetched_at = :fetched_at, payload_json = :payload_json, checksum = :checksum, updated_at = :updated_at
        WHERE id = :id
        `
      ).run({
        id: existing.id,
        title: item.title,
        summary: item.summary,
        published_at: item.published_at ?? null,
        fetched_at: item.fetched_at,
        payload_json: item.payload_json,
        checksum: item.checksum,
        updated_at: now,
      });
      return { rawItemId: existing.id, changed: true, hadContentUpdate: true };
    }
    this.db.prepare("UPDATE raw_items SET fetched_at = :fetched_at WHERE id = :id").run({
      id: existing.id,
      fetched_at: item.fetched_at,
    });
    return { rawItemId: existing.id, changed: false, hadContentUpdate: false };
  }

  listRawItemsForSource(sourceId: string) {
    return this.db
      .prepare(
        `
        SELECT id, source_id, external_id, title, canonical_url, summary, published_at, fetched_at, payload_json, checksum, created_at, updated_at
        FROM raw_items
        WHERE source_id = ?
        ORDER BY id ASC
        `
      )
      .all(sourceId) as unknown as StoredRawItem[];
  }

  deleteEventsForRawItem(rawItemId: number) {
    const result = this.db.prepare("DELETE FROM events WHERE raw_item_id = ?").run(rawItemId);
    return Number(result.changes ?? 0);
  }

  upsertEvent(
    event: Omit<EventRow, "raw_item_id" | "created_at" | "updated_at"> & {
      raw_item_id: number;
      anchor?: string;
      source_priority?: number;
    }
  ) {
    const now = parseDate();
    const existing = this.db.prepare("SELECT id, source_priority FROM events WHERE id = ?").get(event.id) as
      | { id: string; source_priority: number }
      | undefined;
    const { anchor: _anchor, ...normalized } = {
      ...event,
      published_at: event.published_at ?? null,
      products: toJson(event.products),
      models: toJson(event.models),
      tags: toJson(event.tags),
      source_priority: event.source_priority ?? 0,
    };
    const normalizedAnchor = _anchor ?? event.title;
    if (!existing) {
      this.db.prepare(
        `
        INSERT INTO events (
          id, source_id, raw_item_id, source_priority, vendor, category, title, summary, canonical_url, normalized_anchor,
          evidence_url, evidence_excerpt, published_at, event_date, event_date_kind, date_precision,
          products, models, tags, last_seen_at, created_at, updated_at
        )
        VALUES (
          :id, :source_id, :raw_item_id, :source_priority, :vendor, :category, :title, :summary, :canonical_url, :normalized_anchor,
          :evidence_url, :evidence_excerpt, :published_at, :event_date, :event_date_kind, :date_precision,
          :products, :models, :tags, :last_seen_at, :created_at, :updated_at
        )
        `
      ).run({
        ...normalized,
        source_id: event.source_id,
        raw_item_id: event.raw_item_id,
        normalized_anchor: normalizedAnchor,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
      });
      return { inserted: true, updated: false };
    }

    const shouldPromote = normalized.source_priority >= existing.source_priority;
    if (!shouldPromote) {
      this.db.prepare(
        `
        UPDATE events
        SET last_seen_at = :last_seen_at,
            updated_at = :updated_at
        WHERE id = :id
        `
      ).run({
        id: event.id,
        last_seen_at: now,
        updated_at: now,
      });
      return { inserted: false, updated: false };
    }

    this.db.prepare(
      `
      UPDATE events
      SET source_priority = :source_priority,
          title = :title,
          summary = :summary,
          canonical_url = :canonical_url,
          normalized_anchor = :normalized_anchor,
          evidence_url = :evidence_url,
          evidence_excerpt = :evidence_excerpt,
          published_at = :published_at,
          event_date = :event_date,
          event_date_kind = :event_date_kind,
          date_precision = :date_precision,
          products = :products,
          models = :models,
          tags = :tags,
          raw_item_id = :raw_item_id,
          source_id = :source_id,
          last_seen_at = :last_seen_at,
          updated_at = :updated_at
      WHERE id = :id
      `
    ).run({
      id: event.id,
      source_priority: normalized.source_priority,
      title: normalized.title,
      summary: normalized.summary,
      canonical_url: normalized.canonical_url,
      normalized_anchor: normalizedAnchor,
      evidence_url: normalized.evidence_url,
      evidence_excerpt: normalized.evidence_excerpt,
      published_at: normalized.published_at,
      event_date: normalized.event_date,
      event_date_kind: normalized.event_date_kind,
      date_precision: normalized.date_precision,
      products: normalized.products,
      models: normalized.models,
      tags: normalized.tags,
      raw_item_id: event.raw_item_id,
      source_id: event.source_id,
      last_seen_at: now,
      updated_at: now,
    });
    return { inserted: false, updated: true };
  }

  getEvents(filters: {
    vendor?: string | null;
    category?: string | null;
    product?: string | null;
    model?: string | null;
    since?: string | null;
    until?: string | null;
    limit: number;
    cursor?: string | null;
  }) {
    const where: string[] = [];
    const params: Record<string, string | number> = {};
    if (filters.vendor) {
      where.push("vendor = :vendor");
      params.vendor = filters.vendor;
    }
    if (filters.category) {
      where.push("category = :category");
      params.category = filters.category;
    }
    if (filters.since) {
      where.push("event_date >= :since");
      params.since = filters.since;
    }
    if (filters.until) {
      where.push("event_date <= :until");
      params.until = filters.until;
    }
    if (filters.product) {
      where.push("EXISTS (SELECT 1 FROM json_each(events.products) WHERE value = :product)");
      params.product = filters.product;
    }
    if (filters.model) {
      where.push("EXISTS (SELECT 1 FROM json_each(events.models) WHERE value = :model)");
      params.model = filters.model;
    }
    if (filters.cursor) {
      const decoded = decodeCursor(filters.cursor);
      if (decoded) {
        where.push("(event_date < :cursorDate OR (event_date = :cursorDate AND id < :cursorId))");
        params.cursorDate = decoded.eventDate;
        params.cursorId = decoded.id;
      }
    }
    const rows = (this.db
      .prepare(
        `
        SELECT id, vendor, category, title, summary, canonical_url, normalized_anchor, evidence_url, evidence_excerpt, published_at, event_date, event_date_kind, date_precision, products, models, tags, source_id, raw_item_id, last_seen_at, created_at, updated_at
        FROM events
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY event_date DESC, id DESC
        LIMIT :limitPlus
        `
      )
      .all({ ...params, limitPlus: filters.limit + 1 }) as unknown as (EventRow & { normalized_anchor: string })[]);
    const events = rows.slice(0, filters.limit).map((row) => this.rowToEvent(row));
    const hasMore = rows.length > filters.limit;
    const nextCursor = hasMore
      ? encodeCursor({
          eventDate: rows[filters.limit - 1].event_date,
          id: rows[filters.limit - 1].id,
        })
      : null;
    return { events, hasMore, nextCursor };
  }

  getEventById(id: string): EventRow | null {
    const row = this.db.prepare("SELECT * FROM events WHERE id = ?").get(id) as
      | (EventRow & { normalized_anchor: string })
      | undefined;
    return row ? this.rowToEvent(row) : null;
  }

  private rowToEvent(row: EventRow & { normalized_anchor: string }) {
    const products = parseJsonArray(row.products);
    const models = parseJsonArray(row.models);
    const tags = parseJsonArray(row.tags);
    return {
      id: row.id,
      vendor: row.vendor,
      category: row.category,
      title: row.title,
      summary: row.summary,
      canonical_url: row.canonical_url,
      evidence_url: row.evidence_url,
      evidence_excerpt: row.evidence_excerpt,
      published_at: row.published_at,
      event_date: row.event_date,
      event_date_kind: row.event_date_kind,
      date_precision: row.date_precision,
      products,
      models,
      tags,
      source_id: row.source_id,
      raw_item_id: row.raw_item_id,
      last_seen_at: row.last_seen_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    } satisfies EventRow;
  }

  getDbHealth() {
    const { count } = this.db.prepare("SELECT COUNT(*) AS count FROM events").get() as { count: number };
    return { ok: true, event_count: count };
  }

  seedDataIfEmpty(
    entries: Array<{
      id: string;
      vendor: Vendor;
      name: string;
      url: string;
      parser: string;
      enabled?: boolean;
      defaultCategory?: EventCategory;
      default_category?: EventCategory;
      cooldownSeconds?: number;
      cooldown_seconds?: number;
    }>
  ) {
    const count = this.db.prepare("SELECT COUNT(*) AS count FROM sources").get() as { count: number };
    if (count.count === 0) {
      this.upsertSources(entries);
    } else {
      this.upsertSources(entries);
    }
  }
}

const parseJsonArray = (value: unknown) => {
  if (!value) return [];
  try {
    const parsed = Array.isArray(value) ? value : JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
};

const encodeCursor = (value: { eventDate: string; id: string }) =>
  Buffer.from(normalizeString(JSON.stringify(value))).toString("base64");

const decodeCursor = (cursor: string) => {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64").toString());
    if (typeof value?.eventDate === "string" && typeof value?.id === "string") {
      return { eventDate: value.eventDate as string, id: value.id as string };
    }
    return null;
  } catch {
    return null;
  }
};
