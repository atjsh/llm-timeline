import assert from "node:assert/strict";
import { TimelineDatabase } from "../dist/db/sqlite.js";
import { normalizeSourceItems } from "../dist/pipeline/normalize.js";
import { rebuildSourceEventsInDatabase } from "../dist/pipeline/ingest.js";
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

const openAiRssSource = {
  ...source,
  id: "openai-blog-rss",
  name: "OpenAI Blog RSS",
};

const openAiRelease = normalizeSourceItems(openAiRssSource, [
  {
    externalId: "openai-release-1",
    title: "Introducing GPT-5.4",
    canonicalUrl: "https://example.com/gpt-5-4",
    summary: "OpenAI launches a new frontier model.",
    publishedAt: "2026-03-05T10:00:00.000Z",
    feedCategories: ["Product"],
  },
]);
assert.equal(openAiRelease[0].category, "model_release");

const openAiCompanyPost = normalizeSourceItems(openAiRssSource, [
  {
    externalId: "openai-company-1",
    title: "OpenAI and Amazon announce strategic partnership",
    canonicalUrl: "https://example.com/amazon-partnership",
    summary: "Infrastructure and enterprise collaboration update.",
    publishedAt: "2026-02-27T05:30:00.000Z",
    feedCategories: ["Company"],
  },
]);
assert.equal(openAiCompanyPost[0].category, "blog_update");

const openAiResearchRelease = normalizeSourceItems(openAiRssSource, [
  {
    externalId: "openai-research-1",
    title: "Hello GPT-4o",
    canonicalUrl: "https://example.com/hello-gpt-4o",
    summary: "We are announcing a new flagship model.",
    publishedAt: "2024-05-13T10:05:00.000Z",
    feedCategories: ["Research"],
  },
]);
assert.equal(openAiResearchRelease[0].category, "model_release");

const openAiChatGptLaunch = normalizeSourceItems(openAiRssSource, [
  {
    externalId: "openai-chatgpt-1",
    title: "Introducing ChatGPT",
    canonicalUrl: "https://openai.com/index/chatgpt",
    summary: "We’ve trained a model called ChatGPT which interacts in a conversational way.",
    publishedAt: "2022-11-30T08:00:00.000Z",
    feedCategories: ["Product"],
  },
]);
assert.equal(openAiChatGptLaunch[0].category, "model_release");

const openAiChatGptSearch = normalizeSourceItems(openAiRssSource, [
  {
    externalId: "openai-chatgpt-search-1",
    title: "Introducing ChatGPT search",
    canonicalUrl: "https://openai.com/index/introducing-chatgpt-search",
    summary: "A new ChatGPT search experience.",
    publishedAt: "2024-10-31T10:00:00.000Z",
    feedCategories: ["Product"],
  },
]);
assert.equal(openAiChatGptSearch[0].category, "model_release");

const openAiChatGptTier = normalizeSourceItems(openAiRssSource, [
  {
    externalId: "openai-chatgpt-pro-1",
    title: "Introducing ChatGPT Pro",
    canonicalUrl: "https://openai.com/index/introducing-chatgpt-pro",
    summary: "A new premium ChatGPT tier.",
    publishedAt: "2024-12-05T10:30:00.000Z",
    feedCategories: ["Product"],
  },
]);
assert.equal(openAiChatGptTier[0].category, "blog_update");

const openAiChatGptFeature = normalizeSourceItems(openAiRssSource, [
  {
    externalId: "openai-chatgpt-images-1",
    title: "The new ChatGPT Images is here",
    canonicalUrl: "https://openai.com/index/new-chatgpt-images-is-here",
    summary: "A new images feature inside ChatGPT.",
    publishedAt: "2025-12-16T00:00:00.000Z",
    feedCategories: ["Product"],
  },
]);
assert.equal(openAiChatGptFeature[0].category, "blog_update");

const db = new TimelineDatabase(":memory:");
db.seedDataIfEmpty([source, openAiRssSource]);
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

const staleRaw = db.upsertRawItem({
  source_id: source.id,
  external_id: "stale-item",
  title: "Untitled",
  canonical_url: "https://example.com/stale-item",
  summary: "",
  published_at: "2024-02-01T00:00:00.000Z",
  fetched_at: new Date().toISOString(),
  payload_json: JSON.stringify({ title: "Untitled" }),
  checksum: "stale-1",
});

const staleEvents = normalizeSourceItems(source, [
  {
    externalId: "stale-item",
    title: "Untitled",
    canonicalUrl: "https://example.com/stale-item",
    summary: "",
    publishedAt: "2024-02-01T00:00:00.000Z",
  },
]);

for (const event of staleEvents) {
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
    raw_item_id: staleRaw.rawItemId,
    anchor: event.anchor,
    last_seen_at: new Date().toISOString(),
  });
}

const repairedRaw = db.upsertRawItem({
  source_id: source.id,
  external_id: "stale-item",
  title: "Introducing GPT-5.4",
  canonical_url: "https://example.com/stale-item",
  summary: "A repaired title after parser fix.",
  published_at: "2024-02-01T00:00:00.000Z",
  fetched_at: new Date().toISOString(),
  payload_json: JSON.stringify({ title: "Introducing GPT-5.4" }),
  checksum: "stale-2",
});

db.deleteEventsForRawItem(repairedRaw.rawItemId);

const repairedEvents = normalizeSourceItems(source, [
  {
    externalId: "stale-item",
    title: "Introducing GPT-5.4",
    canonicalUrl: "https://example.com/stale-item",
    summary: "A repaired title after parser fix.",
    publishedAt: "2024-02-01T00:00:00.000Z",
  },
]);

for (const event of repairedEvents) {
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
    raw_item_id: repairedRaw.rawItemId,
    anchor: event.anchor,
    last_seen_at: new Date().toISOString(),
  });
}

const repairedList = db.getEvents({ limit: 200, cursor: null });
assert.equal(repairedList.events.filter((event) => event.canonical_url === "https://example.com/stale-item").length, 1);
assert.equal(
  repairedList.events.find((event) => event.canonical_url === "https://example.com/stale-item")?.title,
  "Introducing GPT-5.4"
);

const chatGptRaw = db.upsertRawItem({
  source_id: openAiRssSource.id,
  external_id: "openai-chatgpt-legacy",
  title: "Introducing ChatGPT",
  canonical_url: "https://openai.com/index/chatgpt",
  summary: "We’ve trained a model called ChatGPT which interacts in a conversational way.",
  published_at: "2022-11-30T08:00:00.000Z",
  fetched_at: new Date().toISOString(),
  payload_json: JSON.stringify({
    externalId: "openai-chatgpt-legacy",
    title: "Introducing ChatGPT",
    canonicalUrl: "https://openai.com/index/chatgpt",
    summary: "We’ve trained a model called ChatGPT which interacts in a conversational way.",
    publishedAt: "2022-11-30T08:00:00.000Z",
    feedCategories: ["Product"],
  }),
  checksum: "chatgpt-legacy-1",
});

db.upsertEvent({
  id: "legacy-openai-chatgpt-blog-update",
  vendor: "openai",
  category: "blog_update",
  title: "Introducing ChatGPT",
  summary: "We’ve trained a model called ChatGPT which interacts in a conversational way.",
  canonical_url: "https://openai.com/index/chatgpt",
  evidence_url: "https://openai.com/news/rss.xml",
  evidence_excerpt: "We’ve trained a model called ChatGPT which interacts in a conversational way.",
  published_at: "2022-11-30T08:00:00.000Z",
  event_date: "2022-11-30T08:00:00.000Z",
  event_date_kind: "published",
  date_precision: "datetime",
  products: ["chatgpt"],
  models: [],
  tags: ["blog_update", "openai", "OpenAI Blog RSS", "Product"],
  source_id: openAiRssSource.id,
  raw_item_id: chatGptRaw.rawItemId,
  anchor: "introducing-chatgpt-published-2022-11-30t08-00-00-000z",
  last_seen_at: new Date().toISOString(),
});

const rebuildResult = rebuildSourceEventsInDatabase(db, openAiRssSource.id);
assert.equal(rebuildResult.rawItems, 1);
assert.equal(rebuildResult.deletedCount, 1);

const rebuiltChatGptEvents = db.getEvents({
  vendor: "openai",
  category: "model_release",
  product: null,
  model: null,
  since: null,
  until: null,
  limit: 50,
  cursor: null,
}).events;

assert.equal(
  rebuiltChatGptEvents.filter((event) => event.canonical_url === "https://openai.com/index/chatgpt").length,
  1
);
assert.equal(
  rebuiltChatGptEvents.find((event) => event.canonical_url === "https://openai.com/index/chatgpt")?.category,
  "model_release"
);

const rebuiltCalendar = buildCalendar(rebuiltChatGptEvents);
assert.ok(rebuiltCalendar.includes("SUMMARY:Introducing ChatGPT"));
assert.ok(rebuiltCalendar.includes("URL:https://openai.com/index/chatgpt"));

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
assert.ok(calendar.includes("URL:https://example.com/model-update"));
assert.ok(calendar.includes("Source feed: https://example.com"));
assert.ok(calendar.includes("https://example.com/model-update\\n\\nSource feed: https://example.com"));
assert.ok(!calendar.includes("\\\\n\\\\n"));
