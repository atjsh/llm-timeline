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

insertEvent({
  id: "evt-openai-release-html",
  sourceId: "openai-github-releases",
  vendor: "openai",
  category: "release_note",
  title: "v2.26.0",
  summary: "GitHub release body.",
  evidenceExcerpt:
    '<h2>2.26.0 (2026-03-05)</h2><p>Full Changelog: <a href="https://github.com/openai/openai-python/compare/v2.25.0...v2.26.0">v2.25.0...v2.26.0</a></p><h3>Features</h3><ul><li><strong>api:</strong> The GA ComputerTool now uses the Computer API (&lt;a href="https://github.com/openai/openai-python/pull/123"&gt;#123&lt;/a&gt;).</li></ul><a href="https://github.co...',
  canonicalUrl: "https://github.com/openai/openai-python/releases/tag/v2.26.0",
  eventDate: "2026-03-05T00:00:00.000Z",
  products: ["gpt"],
});

const getHtml = async (path) => {
  const response = await app.fetch(new Request(`http://localhost${path}`));
  const body = await response.text();
  return { response, body };
};

const getJson = async (path) => {
  const response = await app.fetch(new Request(`http://localhost${path}`));
  const body = await response.json();
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
assert.match(firstPage.body, /Load more/);
assert.match(firstPage.body, /data-feeds-loader/);
assert.match(firstPage.body, /Older/);
assert.match(firstPage.body, /data-summary-heading/);

const secondPage = await getHtml(`/feeds?category=model_release&limit=1&cursor=${encodeURIComponent(pagedApiResult.nextCursor)}`);
assert.match(secondPage.body, /Newest/);

const fragment = await getJson(`/feeds/items?category=model_release&limit=1&cursor=${encodeURIComponent(pagedApiResult.nextCursor)}`);
assert.equal(fragment.response.status, 200);
assert.match(fragment.response.headers.get("content-type") ?? "", /^application\/json/i);
assert.equal(fragment.body.returned_count, 1);
assert.equal(fragment.body.has_more, true);
assert.ok(fragment.body.next_cursor);
assert.match(fragment.body.html, /Introducing Claude Opus 4\.6/);
assert.doesNotMatch(fragment.body.html, /<script>alert\("x"\)<\/script>/);

const missingCursor = await getJson("/feeds/items?category=model_release&limit=1");
assert.equal(missingCursor.response.status, 400);
assert.match(missingCursor.body.error, /cursor/i);

const invalidCursor = await getJson("/feeds/items?category=model_release&limit=1&cursor=bad-cursor");
assert.equal(invalidCursor.response.status, 400);

const allCategoriesPage = await getHtml("/feeds?category=all&limit=10");
assert.match(allCategoriesPage.body, /Gemini tooling update/);

const htmlReleaseNotePage = await getHtml("/feeds?vendor=openai&category=release_note&limit=20");
assert.match(htmlReleaseNotePage.body, /v2\.26\.0/);
assert.match(htmlReleaseNotePage.body, /Full Changelog: v2\.25\.0\.\.\.v2\.26\.0/);
assert.doesNotMatch(htmlReleaseNotePage.body, /&lt;h2&gt;2\.26\.0/);
assert.doesNotMatch(htmlReleaseNotePage.body, /&lt;a href=/);
assert.doesNotMatch(htmlReleaseNotePage.body, /href=&quot;https:\/\/github\.com\/openai\/openai-python\/compare\/v2\.25\.0\.\.\.v2\.26\.0&quot;/);

const emptyPage = await getHtml("/feeds?vendor=openai&category=deprecation");
assert.match(emptyPage.body, /No events matched the current filters/);
