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

const anthropicNewsSource = {
  ...source,
  id: "anthropic-news",
  vendor: "anthropic",
  name: "Anthropic News",
  parser: "anthropic_news",
  default_category: "blog_update",
  url: "https://www.anthropic.com/news",
};

const anthropicApiSource = {
  ...source,
  id: "anthropic-releases",
  vendor: "anthropic",
  name: "Claude API Release Notes",
  parser: "anthropic_api_release_notes_html",
  default_category: "release_note",
  url: "https://platform.claude.com/docs/en/release-notes/overview",
};

const anthropicSdkSource = {
  ...source,
  id: "anthropic-github-releases",
  vendor: "anthropic",
  name: "Anthropic GitHub Releases",
  parser: "github_releases",
  default_category: "release_note",
  url: "https://github.com/anthropics/anthropic-sdk-python/releases.atom",
};

const anthropicNewsRelease = normalizeSourceItems(anthropicNewsSource, [
  {
    externalId: "anthropic-news-opus-4-6",
    title: "Introducing Claude Opus 4.6",
    canonicalUrl: "https://www.anthropic.com/news/claude-opus-4-6",
    summary:
      "We’re upgrading our smartest model. Claude Opus 4.6 improves on Claude Opus 4.5, features a 1M token context window in beta, and is available today on claude.ai, our API, and all major cloud platforms.",
    publishedAt: "2026-02-05T00:00:00.000Z",
    feedCategories: ["Announcements"],
  },
]);
assert.equal(anthropicNewsRelease.length, 1);
assert.equal(anthropicNewsRelease[0].category, "model_release");
assert.deepEqual(anthropicNewsRelease[0].models, ["claude-opus-4.6"]);

const anthropicNewsReleaseWithModelId = normalizeSourceItems(anthropicNewsSource, [
  {
    externalId: "anthropic-news-opus-4-5",
    title: "Introducing Claude Opus 4.5",
    canonicalUrl: "https://www.anthropic.com/news/claude-opus-4-5",
    summary:
      "Our newest model, Claude Opus 4.5, is available today. If you’re a developer, simply use claude-opus-4-5-20251101 via the Claude API.",
    publishedAt: "2025-11-24T00:00:00.000Z",
    feedCategories: ["Announcements"],
  },
]);
assert.equal(anthropicNewsReleaseWithModelId.length, 1);
assert.equal(anthropicNewsReleaseWithModelId[0].eventDate, "2025-11-24T00:00:00.000Z");
assert.deepEqual(anthropicNewsReleaseWithModelId[0].models, ["claude-opus-4.5"]);

const anthropicApiLaunch = normalizeSourceItems(anthropicApiSource, [
  {
    externalId: "anthropic-api-sonnet-4-6",
    title: "We’ve launched Claude Sonnet 4.6, our latest balanced model combining speed and intelligence for everyday tasks.",
    canonicalUrl: "https://www.anthropic.com/news/claude-sonnet-4-6",
    summary:
      "We’ve launched Claude Sonnet 4.6, our latest balanced model combining speed and intelligence for everyday tasks.",
    publishedAt: "2026-02-17T00:00:00.000Z",
  },
]);
assert.equal(anthropicApiLaunch.length, 1);
assert.equal(anthropicApiLaunch[0].category, "model_release");
assert.deepEqual(anthropicApiLaunch[0].models, ["claude-sonnet-4.6"]);

const anthropicApiMilestone = normalizeSourceItems(anthropicApiSource, [
  {
    externalId: "anthropic-api-1m-context",
    title: "The 1M token context window is now generally available for Claude Opus 4.6 and Sonnet 4.6 at standard pricing.",
    canonicalUrl: "https://platform.claude.com/docs/en/build-with-claude/context-windows",
    summary:
      "The 1M token context window is now generally available for Claude Opus 4.6 and Sonnet 4.6 at standard pricing.",
    publishedAt: "2026-03-13T00:00:00.000Z",
  },
]);
assert.equal(anthropicApiMilestone.length, 1);
assert.equal(anthropicApiMilestone[0].category, "release_note");
assert.deepEqual(anthropicApiMilestone[0].models, ["claude-opus-4.6", "claude-sonnet-4.6"]);

const anthropicApiFeatureMilestone = normalizeSourceItems(anthropicApiSource, [
  {
    externalId: "anthropic-api-fast-mode",
    title:
      "We’ve launched fast mode in research preview for Opus 4.6, providing significantly faster output token generation via the speed parameter.",
    canonicalUrl: "https://platform.claude.com/docs/en/build-with-claude/fast-mode",
    summary:
      "We’ve launched fast mode in research preview for Opus 4.6, providing significantly faster output token generation via the speed parameter.",
    publishedAt: "2026-02-07T00:00:00.000Z",
  },
]);
assert.equal(anthropicApiFeatureMilestone.length, 1);
assert.equal(anthropicApiFeatureMilestone[0].category, "release_note");
assert.deepEqual(anthropicApiFeatureMilestone[0].models, ["claude-opus-4.6"]);

const anthropicSdkRelease = normalizeSourceItems(anthropicSdkSource, [
  {
    externalId: "anthropic-sdk-v0.80.0",
    title: "v0.80.0",
    canonicalUrl: "https://github.com/anthropics/anthropic-sdk-python/releases/tag/v0.80.0",
    summary: "Features api: Releasing claude-sonnet-4-6.",
    publishedAt: "2026-02-17T00:00:00.000Z",
  },
]);
assert.equal(anthropicSdkRelease.length, 1);
assert.equal(anthropicSdkRelease[0].category, "release_note");
assert.deepEqual(anthropicSdkRelease[0].models, ["claude-sonnet-4.6"]);

const googleBlogSource = {
  ...source,
  id: "google-ai-blog-rss",
  vendor: "google",
  name: "Google Gemini Blog RSS",
};

const googleChangelogSource = {
  ...source,
  id: "google-cloud-ai-release-notes",
  vendor: "google",
  name: "Google Gemini API Changelog",
  parser: "google_gemini_api_html",
};

const googleVertexSource = {
  ...source,
  id: "google-vertex-release-notes",
  vendor: "google",
  name: "Vertex Generative AI Release Notes",
  parser: "google_vertex_release_notes_html",
};

const googleSdkSource = {
  ...source,
  id: "google-gemini-release-notes-rss",
  vendor: "google",
  name: "Google Gen AI JS SDK Releases",
  parser: "github_releases",
  default_category: "release_note",
};

const googleBlogRelease = normalizeSourceItems(googleBlogSource, [
  {
    externalId: "google-blog-1",
    title: "Gemini 3.1 Pro: A smarter model for your most complex tasks",
    canonicalUrl: "https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-pro/",
    summary: "Gemini 3.1 Pro is available in preview for complex reasoning workloads.",
    publishedAt: "2026-02-19T16:00:00.000Z",
    feedCategories: ["Gemini models"],
  },
]);
assert.equal(googleBlogRelease.length, 1);
assert.equal(googleBlogRelease[0].category, "model_release");
assert.ok(googleBlogRelease[0].models.includes("gemini-3.1-pro"));

const googleBlogConsumerNoise = normalizeSourceItems(googleBlogSource, [
  {
    externalId: "google-blog-noise-1",
    title: "Find out what’s new in the Gemini app in February's Gemini Drop.",
    canonicalUrl: "https://blog.google/innovation-and-ai/products/gemini-app/gemini-drop-february-2026/",
    summary: "Gemini Drops is our regular monthly update on how to get the most out of the Gemini app.",
    publishedAt: "2026-02-27T17:00:00.000Z",
    feedCategories: ["Gemini App"],
  },
]);
assert.equal(googleBlogConsumerNoise.length, 0);

const googleVertexPartnerModel = normalizeSourceItems(googleVertexSource, [
  {
    externalId: "google-vertex-partner-1",
    title: "Anthropic's Claude 3 Haiku",
    canonicalUrl: "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/deprecations/partner-models#haiku-3",
    summary: "Anthropic's Claude 3 Haiku is deprecated as of February 23, 2026 and will be shut down on August 23, 2026.",
    publishedAt: "2026-02-23T00:00:00.000Z",
    sourceLabel: "Deprecated",
  },
]);
assert.equal(googleVertexPartnerModel.length, 0);

const googleSdkRelease = normalizeSourceItems(googleSdkSource, [
  {
    externalId: "google-sdk-1",
    title: "v1.44.0",
    canonicalUrl: "https://github.com/googleapis/js-genai/releases/tag/v1.44.0",
    summary: "Features Add gemini-3.1-flash-image-preview model.",
    publishedAt: "2026-03-04T23:40:39.000Z",
  },
]);
assert.equal(googleSdkRelease[0].category, "release_note");
assert.ok(googleSdkRelease[0].products.includes("gemini"));

const googleChangelogModelRelease = normalizeSourceItems(googleChangelogSource, [
  {
    externalId: "google-changelog-embedding-1",
    title: "Released gemini-embedding-2-preview, our first multimodal embedding model.",
    canonicalUrl: "https://ai.google.dev/gemini-api/docs/embeddings",
    summary: "Released gemini-embedding-2-preview, our first multimodal embedding model.",
    publishedAt: "2026-03-10T00:00:00.000Z",
    sourceLabel: "Feature",
  },
]);
assert.equal(googleChangelogModelRelease.length, 1);
assert.equal(googleChangelogModelRelease[0].category, "model_release");

const googleChangelogPricingNoise = normalizeSourceItems(googleChangelogSource, [
  {
    externalId: "google-changelog-pricing-1",
    title: "Gemini 3 billing for Grounding with Google Search will begin on January 5, 2026.",
    canonicalUrl: "https://ai.google.dev/gemini-api/docs/google-search",
    summary: "Gemini 3 billing for Grounding with Google Search will begin on January 5, 2026.",
    publishedAt: "2026-01-05T00:00:00.000Z",
    sourceLabel: "Feature",
  },
]);
assert.equal(googleChangelogPricingNoise.length, 1);
assert.equal(googleChangelogPricingNoise[0].category, "release_note");

const db = new TimelineDatabase(":memory:");
db.seedDataIfEmpty([
  source,
  openAiRssSource,
  anthropicNewsSource,
  anthropicApiSource,
  anthropicSdkSource,
  googleBlogSource,
  googleChangelogSource,
  googleVertexSource,
  googleSdkSource,
]);
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

const anthropicNewsRaw = db.upsertRawItem({
  source_id: anthropicNewsSource.id,
  external_id: "anthropic-news-opus-4-6",
  title: "Introducing Claude Opus 4.6",
  canonical_url: "https://www.anthropic.com/news/claude-opus-4-6",
  summary:
    "We’re upgrading our smartest model. Opus 4.6 features a 1M token context window in beta and is available today on claude.ai, our API, and all major cloud platforms.",
  published_at: "2026-02-05T00:00:00.000Z",
  fetched_at: new Date().toISOString(),
  payload_json: JSON.stringify({
    externalId: "anthropic-news-opus-4-6",
    title: "Introducing Claude Opus 4.6",
    canonicalUrl: "https://www.anthropic.com/news/claude-opus-4-6",
    summary:
      "We’re upgrading our smartest model. Opus 4.6 features a 1M token context window in beta and is available today on claude.ai, our API, and all major cloud platforms.",
    publishedAt: "2026-02-05T00:00:00.000Z",
    feedCategories: ["Announcements"],
  }),
  checksum: "anthropic-news-opus-4-6",
});

for (const event of anthropicNewsRelease) {
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
    source_id: anthropicNewsSource.id,
    raw_item_id: anthropicNewsRaw.rawItemId,
    anchor: event.anchor,
    source_priority: event.sourcePriority,
    last_seen_at: new Date().toISOString(),
  });
}

const anthropicApiLaunchRaw = db.upsertRawItem({
  source_id: anthropicApiSource.id,
  external_id: "anthropic-api-opus-4-6-launch",
  title: "Claude Opus 4.6 is now available in the API and claude.ai.",
  canonical_url: "https://platform.claude.com/docs/en/release-notes/overview#2026-02-05-1",
  summary: "Claude Opus 4.6 is now available in the API and claude.ai.",
  published_at: "2026-02-05T00:00:00.000Z",
  fetched_at: new Date().toISOString(),
  payload_json: JSON.stringify({
    externalId: "anthropic-api-opus-4-6-launch",
    title: "Claude Opus 4.6 is now available in the API and claude.ai.",
    canonicalUrl: "https://platform.claude.com/docs/en/release-notes/overview#2026-02-05-1",
    summary: "Claude Opus 4.6 is now available in the API and claude.ai.",
    publishedAt: "2026-02-05T00:00:00.000Z",
  }),
  checksum: "anthropic-api-opus-4-6-launch",
});

for (const event of normalizeSourceItems(anthropicApiSource, [
  {
    externalId: "anthropic-api-opus-4-6-launch",
    title: "Claude Opus 4.6 is now available in the API and claude.ai.",
    canonicalUrl: "https://platform.claude.com/docs/en/release-notes/overview#2026-02-05-1",
    summary: "Claude Opus 4.6 is now available in the API and claude.ai.",
    publishedAt: "2026-02-05T00:00:00.000Z",
  },
])) {
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
    source_id: anthropicApiSource.id,
    raw_item_id: anthropicApiLaunchRaw.rawItemId,
    anchor: event.anchor,
    source_priority: event.sourcePriority,
    last_seen_at: new Date().toISOString(),
  });
}

const anthropicModelReleaseEvents = db.getEvents({
  vendor: "anthropic",
  category: "model_release",
  product: null,
  model: null,
  since: null,
  until: null,
  limit: 20,
  cursor: null,
}).events;

assert.equal(anthropicModelReleaseEvents.length, 1);
assert.equal(anthropicModelReleaseEvents[0].source_id, anthropicNewsSource.id);
assert.equal(anthropicModelReleaseEvents[0].canonical_url, "https://www.anthropic.com/news/claude-opus-4-6");

const googleVertexRaw = db.upsertRawItem({
  source_id: googleVertexSource.id,
  external_id: "google-vertex-gemini-3.1-pro",
  title: "Gemini 3.1 Pro Preview",
  canonical_url: "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-1-pro",
  summary: "Gemini 3.1 Pro is available in preview in Model Garden.",
  published_at: "2026-02-19T00:00:00.000Z",
  fetched_at: new Date().toISOString(),
  payload_json: JSON.stringify({
    externalId: "google-vertex-gemini-3.1-pro",
    title: "Gemini 3.1 Pro Preview",
    canonicalUrl: "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-1-pro",
    summary: "Gemini 3.1 Pro is available in preview in Model Garden.",
    publishedAt: "2026-02-19T00:00:00.000Z",
    sourceLabel: "Feature",
  }),
  checksum: "google-vertex-gemini-3.1-pro",
});

for (const event of normalizeSourceItems(googleVertexSource, [
  {
    externalId: "google-vertex-gemini-3.1-pro",
    title: "Gemini 3.1 Pro Preview",
    canonicalUrl: "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-1-pro",
    summary: "Gemini 3.1 Pro is available in preview in Model Garden.",
    publishedAt: "2026-02-19T00:00:00.000Z",
    sourceLabel: "Feature",
  },
])) {
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
    source_id: googleVertexSource.id,
    raw_item_id: googleVertexRaw.rawItemId,
    anchor: event.anchor,
    source_priority: event.sourcePriority,
    last_seen_at: new Date().toISOString(),
  });
}

const googleBlogRaw = db.upsertRawItem({
  source_id: googleBlogSource.id,
  external_id: "google-blog-gemini-3.1-pro",
  title: "Gemini 3.1 Pro: A smarter model for your most complex tasks",
  canonical_url: "https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-pro/",
  summary: "Gemini 3.1 Pro is available in preview for complex reasoning workloads.",
  published_at: "2026-02-19T16:00:00.000Z",
  fetched_at: new Date().toISOString(),
  payload_json: JSON.stringify({
    externalId: "google-blog-gemini-3.1-pro",
    title: "Gemini 3.1 Pro: A smarter model for your most complex tasks",
    canonicalUrl: "https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-pro/",
    summary: "Gemini 3.1 Pro is available in preview for complex reasoning workloads.",
    publishedAt: "2026-02-19T16:00:00.000Z",
    feedCategories: ["Gemini models"],
  }),
  checksum: "google-blog-gemini-3.1-pro",
});

for (const event of googleBlogRelease) {
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
    source_id: googleBlogSource.id,
    raw_item_id: googleBlogRaw.rawItemId,
    anchor: event.anchor,
    source_priority: event.sourcePriority,
    last_seen_at: new Date().toISOString(),
  });
}

const googleChangelogRaw = db.upsertRawItem({
  source_id: googleChangelogSource.id,
  external_id: "google-changelog-gemini-3.1-pro",
  title: "Released Gemini 3.1 Pro Preview",
  canonical_url: "https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview",
  summary: "Released Gemini 3.1 Pro Preview, our latest iteration in the Gemini 3 series family.",
  published_at: "2026-02-19T00:00:00.000Z",
  fetched_at: new Date().toISOString(),
  payload_json: JSON.stringify({
    externalId: "google-changelog-gemini-3.1-pro",
    title: "Released Gemini 3.1 Pro Preview",
    canonicalUrl: "https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview",
    summary: "Released Gemini 3.1 Pro Preview, our latest iteration in the Gemini 3 series family.",
    publishedAt: "2026-02-19T00:00:00.000Z",
    sourceLabel: "Feature",
  }),
  checksum: "google-changelog-gemini-3.1-pro",
});

for (const event of normalizeSourceItems(googleChangelogSource, [
  {
    externalId: "google-changelog-gemini-3.1-pro",
    title: "Released Gemini 3.1 Pro Preview",
    canonicalUrl: "https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview",
    summary: "Released Gemini 3.1 Pro Preview, our latest iteration in the Gemini 3 series family.",
    publishedAt: "2026-02-19T00:00:00.000Z",
    sourceLabel: "Feature",
  },
])) {
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
    source_id: googleChangelogSource.id,
    raw_item_id: googleChangelogRaw.rawItemId,
    anchor: event.anchor,
    source_priority: event.sourcePriority,
    last_seen_at: new Date().toISOString(),
  });
}

const googleReleaseEvents = db.getEvents({
  vendor: "google",
  category: "model_release",
  product: null,
  model: null,
  since: null,
  until: null,
  limit: 20,
  cursor: null,
}).events;

assert.equal(googleReleaseEvents.length, 1);
assert.equal(
  googleReleaseEvents[0].canonical_url,
  "https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-pro/"
);
assert.equal(googleReleaseEvents[0].source_id, googleBlogSource.id);

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
