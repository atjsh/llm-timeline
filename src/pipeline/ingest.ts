import { TimelineDatabase } from "../db/sqlite.js";
import { config } from "../config.js";
import { normalizeSourceItems } from "./normalize.js";
import { fetchSource, hashSourceItem } from "../sources/fetchers.js";
import { sourceManifest } from "../sources/manifest.js";
import type { SourceManifestEntry, RawParsedEvent, SourceRow } from "../types.js";
const parseDate = () => new Date().toISOString();

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
    last_seen_at: parseDate(),
  }));

const hydrateSources = (manifest: SourceManifestEntry[]) => manifest.map((entry) => ({
  id: entry.id,
  vendor: entry.vendor,
  name: entry.name,
  url: entry.url,
  parser: entry.parser,
  defaultCategory: entry.defaultCategory ?? "blog_update",
  cooldownSeconds: entry.cooldownSeconds ?? 3600,
}));

export const runIngestion = async (options: { backfillSince?: string | null } = {}) => {
  const dbPath = config.databasePath;
  const db = new TimelineDatabase(dbPath);
  db.seedDataIfEmpty(hydrateSources(sourceManifest));
  const sources = options.backfillSince ? db.getAllSources() : db.getDueSources();

  const start = Date.now();
  const queue = [...sources];
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
