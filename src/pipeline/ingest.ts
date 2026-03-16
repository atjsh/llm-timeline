import { TimelineDatabase } from "../db/sqlite.js";
import { config } from "../config.js";
import { normalizeSourceItems } from "./normalize.js";
import { fetchSource, hashSourceItem } from "../sources/fetchers.js";
import { sourceManifest } from "../sources/manifest.js";
import type { ParsedSourceItem, RawParsedEvent, SourceManifestEntry, SourceRow, StoredRawItem, Vendor } from "../types.js";
const parseDate = () => new Date().toISOString();

const sourcePriority: Record<string, number> = {
  "anthropic-github-releases": 10,
  "anthropic-releases": 20,
  "anthropic-news": 30,
  "google-gemini-release-notes-rss": 10,
  "google-vertex-release-notes": 20,
  "google-cloud-ai-release-notes": 30,
  "google-ai-blog-rss": 40,
};

const normalizeRows = (values: RawParsedEvent[]) =>
  values.map((event) => ({
    id: event.id,
    vendor: event.vendor,
    category: event.category,
    title: event.title,
    summary: event.summary,
    canonical_url: event.canonicalUrl,
    evidence_url: event.evidenceUrl,
    evidence_excerpt: event.evidenceExcerpt,
    published_at: event.publishedAt,
    event_date: event.eventDate,
    event_date_kind: event.eventDateKind,
    date_precision: event.datePrecision,
    products: event.products,
    models: event.models,
    tags: event.tags,
    source_priority: event.sourcePriority ?? 0,
    last_seen_at: parseDate(),
  }));

const hydrateSources = (manifest: SourceManifestEntry[]) => manifest.map((entry) => ({
  id: entry.id,
  vendor: entry.vendor,
  name: entry.name,
  url: entry.url,
  parser: entry.parser,
  enabled: entry.enabled ?? true,
  defaultCategory: entry.defaultCategory ?? "blog_update",
  cooldownSeconds: entry.cooldownSeconds ?? 3600,
}));

const seedSources = (db: TimelineDatabase) => {
  db.seedDataIfEmpty(hydrateSources(sourceManifest));
};

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value) ? value.map((entry) => String(entry).trim()).filter(Boolean) : undefined;

const parsedItemFromStoredRaw = (row: StoredRawItem): ParsedSourceItem => {
  let payload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.payload_json) as unknown;
    if (parsed && typeof parsed === "object") {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    // Fall back to the normalized raw_items columns if stored payloads are malformed.
  }

  return {
    externalId: typeof payload.externalId === "string" && payload.externalId.trim() ? payload.externalId : row.external_id,
    title: typeof payload.title === "string" && payload.title.trim() ? payload.title : row.title,
    canonicalUrl:
      typeof payload.canonicalUrl === "string" && payload.canonicalUrl.trim() ? payload.canonicalUrl : row.canonical_url,
    summary: typeof payload.summary === "string" ? payload.summary : row.summary,
    publishedAt:
      typeof payload.publishedAt === "string" && payload.publishedAt.trim() ? payload.publishedAt : row.published_at ?? undefined,
    eventDateHints: normalizeStringArray(payload.eventDateHints),
    feedCategories: normalizeStringArray(payload.feedCategories),
    sourceLabel: typeof payload.sourceLabel === "string" && payload.sourceLabel.trim() ? payload.sourceLabel : undefined,
  };
};

export const rebuildSourceEventsInDatabase = (db: TimelineDatabase, sourceId: string) => {
  const source = db.getSource(sourceId);
  if (!source) {
    throw new Error(`Unknown source: ${sourceId}`);
  }

  const rawItems = db.listRawItemsForSource(sourceId);
  let deletedCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;

  for (const rawItem of rawItems) {
    deletedCount += db.deleteEventsForRawItem(rawItem.id);
    const parsedItem = parsedItemFromStoredRaw(rawItem);
    const events = normalizeSourceItems(source, [parsedItem]);
    for (const event of events) {
      const normalized = normalizeRows([event])[0];
      const outcome = db.upsertEvent({
        ...normalized,
        source_id: source.id,
        raw_item_id: rawItem.id,
        anchor: event.anchor,
      });
      if (outcome.inserted) insertedCount += 1;
      if (outcome.updated) updatedCount += 1;
    }
  }

  return {
    sourceId,
    rawItems: rawItems.length,
    deletedCount,
    insertedCount,
    updatedCount,
  };
};

export const rebuildSourceEvents = async (sourceId: string) => {
  const db = new TimelineDatabase(config.databasePath);
  seedSources(db);
  return rebuildSourceEventsInDatabase(db, sourceId);
};

export const runIngestion = async (options: { backfillSince?: string | null; vendor?: Vendor | null } = {}) => {
  const dbPath = config.databasePath;
  const db = new TimelineDatabase(dbPath);
  seedSources(db);
  const sources = (options.backfillSince ? db.getAllSources() : db.getDueSources()).filter((source) =>
    options.vendor ? source.vendor === options.vendor : true
  );

  const start = Date.now();
  const queue = [...sources].sort((left, right) => (sourcePriority[left.id] ?? 0) - (sourcePriority[right.id] ?? 0));
  const concurrency = Math.max(1, config.maxFetchConcurrency);
  let running = 0;
  let idx = 0;
  const errors: string[] = [];
  const processOne = async (source: SourceRow) => {
    let runId = 0;
    let inserted = 0;
    let updated = 0;
    let fetched = 0;
    try {
      runId = db.startFetchRun(source.id);
      const fetchedData = await fetchSource(source, options.backfillSince ?? undefined);
      db.updateSourceMetadata(source.id, {
        etag: fetchedData.etag,
        lastModified: fetchedData.lastModified,
        fetchRunId: runId,
      });
      if (!fetchedData.notModified) {
        fetched = fetchedData.items.length;
        for (const raw of fetchedData.items) {
          const rawInsert = db.upsertRawItem({
            source_id: source.id,
            external_id: raw.externalId,
            title: raw.title,
            canonical_url: raw.canonicalUrl,
            summary: raw.summary,
            published_at: raw.publishedAt,
            fetched_at: fetchedData.fetchedAt,
            payload_json: JSON.stringify(raw),
            checksum: hashSourceItem(raw),
          });
          if (!rawInsert.changed && !rawInsert.hadContentUpdate) continue;
          const events = normalizeSourceItems(source, [raw]);
          if (rawInsert.hadContentUpdate) {
            db.deleteEventsForRawItem(rawInsert.rawItemId);
          }
          for (const event of events) {
            const normalized = normalizeRows([event])[0];
            const outcome = db.upsertEvent({
              ...normalized,
              source_id: source.id,
              raw_item_id: rawInsert.rawItemId,
              anchor: event.anchor,
            });
            if (outcome.inserted) inserted += 1;
            if (outcome.updated) updated += 1;
          }
        }
      }
      db.finishFetchRun(runId, {
        status: "success",
        fetchedCount: fetched,
        insertedCount: inserted,
        updatedCount: updated,
      });
    } catch (error) {
      errors.push(`${source.id}: ${String(error)}`);
      if (runId) {
        db.finishFetchRun(runId, {
          status: "error",
          fetchedCount: fetched,
          insertedCount: inserted,
          updatedCount: updated,
          error: String(error),
        });
      }
    }
  };

  await new Promise<void>((resolve, reject) => {
    const tick = () => {
      if (idx >= queue.length && running === 0) {
        if (errors.length) {
          reject(new Error(errors.join("\n")));
        } else {
          resolve();
        }
        return;
      }
      while (running < concurrency && idx < queue.length) {
        const source = queue[idx++];
        running += 1;
        processOne(source)
          .finally(() => {
            running -= 1;
            tick();
          })
          .catch(() => {
            // errors are captured above.
          });
      }
    };
    tick();
  });

  const durationMs = Date.now() - start;
  return {
    sources: queue.length,
    durationMs,
    errors,
  };
};
