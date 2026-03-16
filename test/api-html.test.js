import assert from "node:assert/strict";
import { createApp } from "../dist/api/index.js";
import { TimelineDatabase } from "../dist/db/sqlite.js";

const db = new TimelineDatabase(":memory:");
const app = createApp(db);

const insertEvent = ({
  id,
  sourceId,
  vendor,
  category,
  title,
  summary,
  evidenceExcerpt = summary,
  canonicalUrl,
  eventDate,
  products = [],
  models = [],
}) => {
  const fetchedAt = new Date().toISOString();
  const rawItem = db.upsertRawItem({
    source_id: sourceId,
    external_id: id,
    title,
    canonical_url: canonicalUrl,
    summary,
    published_at: eventDate,
    fetched_at: fetchedAt,
    payload_json: JSON.stringify({
      externalId: id,
      title,
      canonicalUrl,
      summary,
      publishedAt: eventDate,
    }),
    checksum: id,
  });

  db.upsertEvent({
    id,
    vendor,
    category,
    title,
    summary,
    canonical_url: canonicalUrl,
    evidence_url: canonicalUrl,
    evidence_excerpt: evidenceExcerpt,
    published_at: eventDate,
    event_date: eventDate,
    event_date_kind: "published",
    date_precision: "datetime",
    products,
    models,
    tags: [vendor, category],
    source_id: sourceId,
    raw_item_id: rawItem.rawItemId,
    source_priority: 10,
  });
};

insertEvent({
  id: "evt-openai-alpha",
  sourceId: "openai-blog-rss",
  vendor: "openai",
  category: "model_release",
  title: 'OpenAI <Launch> "Alpha" & more',
  summary: "Previewing the <b>latest</b> model update.",
  evidenceExcerpt: 'Escaped <script>alert("x")</script> excerpt & details',
  canonicalUrl: "https://openai.com/index/alpha",
  eventDate: "2026-03-12T00:00:00.000Z",
  products: ["chatgpt"],
  models: ["gpt-alpha"],
});

insertEvent({
  id: "evt-anthropic-opus",
  sourceId: "anthropic-news",
  vendor: "anthropic",
  category: "model_release",
  title: "Introducing Claude Opus 4.6",
  summary: "Anthropic announced a richer Opus release.",
  canonicalUrl: "https://www.anthropic.com/news/claude-opus-4-6",
  eventDate: "2026-03-10T00:00:00.000Z",
  products: ["claude"],
  models: ["claude-opus-4.6"],
});

insertEvent({
  id: "evt-google-gemini",
  sourceId: "google-ai-blog-rss",
  vendor: "google",
  category: "model_release",
  title: "Gemini 3.1 Pro",
  summary: "Google shipped Gemini 3.1 Pro.",
  canonicalUrl: "https://blog.google/innovation-and-ai/models-and-research/gemini-3-1-pro/",
  eventDate: "2026-03-08T00:00:00.000Z",
  products: ["gemini"],
  models: ["gemini-3.1-pro"],
});

insertEvent({
  id: "evt-google-release-note",
  sourceId: "google-cloud-ai-release-notes",
  vendor: "google",
  category: "release_note",
  title: "Gemini tooling update",
  summary: "Additional tooling support.",
  canonicalUrl: "https://ai.google.dev/gemini-api/docs/changelog",
  eventDate: "2026-03-07T00:00:00.000Z",
  products: ["gemini"],
  models: ["gemini-3.1-pro"],
});

const getHtml = async (path) => {
  const response = await app.fetch(new Request(`http://localhost${path}`));
  const body = await response.text();
  return { response, body };
};

const defaultPage = await getHtml("/feeds");
assert.equal(defaultPage.response.status, 200);
assert.match(defaultPage.response.headers.get("content-type") ?? "", /^text\/html/i);
assert.match(defaultPage.body, /LLM Feeds/);
assert.match(defaultPage.body, /OpenAI &lt;Launch&gt; &quot;Alpha&quot; &amp; more/);
assert.doesNotMatch(defaultPage.body, /<script>alert\("x"\)<\/script>/);
assert.match(defaultPage.body, /Introducing Claude Opus 4\.6/);
assert.doesNotMatch(defaultPage.body, /Gemini tooling update/);
assert.match(defaultPage.body, /Current JSON/);
assert.match(defaultPage.body, /Current ICS/);

const filteredPage = await getHtml("/feeds?vendor=anthropic&category=model_release");
assert.match(filteredPage.body, /Introducing Claude Opus 4\.6/);
assert.doesNotMatch(filteredPage.body, /OpenAI &lt;Launch&gt;/);
assert.doesNotMatch(filteredPage.body, /Gemini 3\.1 Pro/);

const pagedApiResult = db.getEvents({
  vendor: null,
  category: "model_release",
  product: null,
  model: null,
  since: null,
  until: null,
  cursor: null,
  limit: 1,
});
assert.ok(pagedApiResult.nextCursor);

const firstPage = await getHtml("/feeds?category=model_release&limit=1");
assert.match(firstPage.body, /Older/);

const secondPage = await getHtml(`/feeds?category=model_release&limit=1&cursor=${encodeURIComponent(pagedApiResult.nextCursor)}`);
assert.match(secondPage.body, /Newest/);

const allCategoriesPage = await getHtml("/feeds?category=all&limit=10");
assert.match(allCategoriesPage.body, /Gemini tooling update/);

const emptyPage = await getHtml("/feeds?vendor=openai&category=deprecation");
assert.match(emptyPage.body, /No events matched the current filters/);
