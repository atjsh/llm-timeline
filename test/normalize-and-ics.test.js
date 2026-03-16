import assert from "node:assert/strict";
import { TimelineDatabase } from "../dist/db/sqlite.js";
import { normalizeSourceItems } from "../dist/pipeline/normalize.js";
import { buildCalendar } from "../dist/ics/renderer.js";

const source = {
  id: "test-openai",
  vendor: "openai",
  name: "OpenAI Test",
  url: "https://example.com",
  parser: "rss_atom",
  enabled: true,
  default_category: "blog_update",
  cooldown_seconds: 3600,
  etag: null,
  last_modified: null,
  last_fetched_at: null,
  last_success_at: null,
  last_error: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const item = {
  externalId: "item-1",
  title: "Model update",
  canonicalUrl: "https://example.com/model-update",
  summary: "OpenAI announces release windows. January 10, 2024 and March 5, 2024.",
  publishedAt: "2024-01-10T00:00:00.000Z",
  eventDateHints: ["2024-01-10T00:00:00.000Z", "2024-03-05T00:00:00.000Z"],
};

const normalized = normalizeSourceItems(source, [item]);
assert.equal(normalized.length, 2);
assert.notEqual(normalized[0].id, normalized[1].id);

const db = new TimelineDatabase(":memory:");
db.seedDataIfEmpty([source]);
const raw = db.upsertRawItem({
  source_id: source.id,
  external_id: item.externalId,
  title: item.title,
  canonical_url: item.canonicalUrl,
  summary: item.summary,
  published_at: item.publishedAt,
  fetched_at: new Date().toISOString(),
  payload_json: JSON.stringify(item),
  checksum: "abc",
});

for (const event of normalized) {
  db.upsertEvent({
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
    source_id: source.id,
    raw_item_id: raw.rawItemId,
    anchor: event.anchor,
    last_seen_at: new Date().toISOString(),
  });
}

db.upsertEvent({
  id: "missing-published-at",
  vendor: "anthropic",
  category: "deprecation",
  title: "Anthropic deprecation",
  summary: "Event without an upstream published timestamp.",
  canonical_url: "https://example.com/deprecation",
  evidence_url: "https://example.com/deprecation",
  evidence_excerpt: "Event without an upstream published timestamp.",
  event_date: "2024-04-01",
  event_date_kind: "deprecation",
  date_precision: "date",
  products: [],
  models: [],
  tags: ["deprecation"],
  source_id: source.id,
  raw_item_id: raw.rawItemId,
  anchor: "anthropic-deprecation-2024-04-01",
  last_seen_at: new Date().toISOString(),
});

const calendar = buildCalendar(normalized.map((event) => ({
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
  source_id: source.id,
  raw_item_id: raw.rawItemId,
  last_seen_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})));

assert.ok(calendar.includes("BEGIN:VCALENDAR"));
assert.ok(calendar.includes("SUMMARY:Model update"));
assert.ok(calendar.includes("DTEND;VALUE=DATE:20240111"));
