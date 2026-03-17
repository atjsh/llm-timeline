import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportPages } from "../dist/static/export-pages.js";
import { TimelineDatabase } from "../dist/db/sqlite.js";

const insertEvent = (db, { id, sourceId, vendor, category, title, summary, canonicalUrl, eventDate, products = [], models = [] }) => {
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
    evidence_excerpt: summary,
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

const db = new TimelineDatabase(":memory:");

db.upsertSources([
  {
    id: "openai-blog-rss",
    vendor: "openai",
    name: "OpenAI Blog",
    url: "https://openai.com/news/rss.xml",
    parser: "rss_atom",
  },
  {
    id: "anthropic-releases",
    vendor: "anthropic",
    name: "Anthropic Releases",
    url: "https://platform.claude.com/docs/en/release-notes/overview",
    parser: "anthropic_api_release_notes_html",
  },
  {
    id: "google-cloud-ai-release-notes",
    vendor: "google",
    name: "Google Gemini API Changelog",
    url: "https://ai.google.dev/gemini-api/docs/changelog",
    parser: "google_gemini_api_html",
  },
]);

insertEvent(db, {
  id: "evt-openai-alpha",
  sourceId: "openai-blog-rss",
  vendor: "openai",
  category: "model_release",
  title: "OpenAI Alpha",
  summary: "Alpha release summary.",
  canonicalUrl: "https://openai.com/index/alpha",
  eventDate: "2026-03-12T00:00:00.000Z",
  products: ["chatgpt"],
  models: ["gpt-alpha"],
});

insertEvent(db, {
  id: "evt-anthropic-deprecation",
  sourceId: "anthropic-releases",
  vendor: "anthropic",
  category: "deprecation",
  title: "Retiring Claude Haiku 3",
  summary: "Migration guidance for Claude Haiku 3.",
  canonicalUrl: "https://www.anthropic.com/news/claude-haiku-3-retirement",
  eventDate: "2026-03-10T00:00:00.000Z",
  products: ["claude"],
  models: ["claude-haiku-3"],
});

insertEvent(db, {
  id: "evt-anthropic-opus",
  sourceId: "anthropic-releases",
  vendor: "anthropic",
  category: "model_release",
  title: "Introducing Claude Opus 4.6",
  summary: "Anthropic release summary.",
  canonicalUrl: "https://www.anthropic.com/news/claude-opus-4-6",
  eventDate: "2026-03-10T00:00:00.000Z",
  products: ["claude"],
  models: ["claude-opus-4.6"],
});

insertEvent(db, {
  id: "evt-google-release",
  sourceId: "google-cloud-ai-release-notes",
  vendor: "google",
  category: "release_note",
  title: "Gemini tooling update",
  summary: "Release note body.",
  canonicalUrl: "https://ai.google.dev/gemini-api/docs/changelog",
  eventDate: "2026-03-09T00:00:00.000Z",
  products: ["gemini"],
  models: ["gemini-3.1-pro"],
});

const outDir = mkdtempSync(join(tmpdir(), "llm-timeline-pages-"));

try {
  const result = exportPages({ db, outDir });
  assert.equal(result.eventCount, 4);
  assert.ok(existsSync(join(outDir, "index.html")));
  assert.ok(existsSync(join(outDir, "feeds", "index.html")));
  assert.ok(existsSync(join(outDir, "assets", "events.json")));
  assert.ok(existsSync(join(outDir, ".nojekyll")));

  const rootHtml = readFileSync(join(outDir, "index.html"), "utf8");
  assert.match(rootHtml, /Redirecting to the static timeline preview/);
  assert.match(rootHtml, /\.\/feeds\//);

  const feedsHtml = readFileSync(join(outDir, "feeds", "index.html"), "utf8");
  assert.match(feedsHtml, /LLM timeline/);
  assert.match(feedsHtml, /Exported [A-Z][a-z]{2} \d{1,2}, \d{4}/);
  assert.match(feedsHtml, /Heatmap/);
  assert.match(feedsHtml, /Release activity by day/);
  assert.match(feedsHtml, /data-chart-root/);
  assert.match(feedsHtml, /data-chart-scroll/);
  assert.match(feedsHtml, /data-chart-day="2026-03-10"/);
  assert.match(feedsHtml, /heatmap__grid/);
  assert.match(feedsHtml, /data-data-href="\.\.\/assets\/events\.json"/);
  assert.match(feedsHtml, /data-feeds-form/);
  assert.match(feedsHtml, /OpenAI Alpha/);
  assert.match(feedsHtml, /Introducing Claude Opus 4\.6/);
  assert.doesNotMatch(feedsHtml, /Current JSON/);
  assert.doesNotMatch(feedsHtml, /Current ICS/);
  assert.doesNotMatch(feedsHtml, /Source Status/);
  assert.doesNotMatch(feedsHtml, /Static Snapshot/);
  assert.doesNotMatch(feedsHtml, /Snapshot entry/);
  assert.doesNotMatch(feedsHtml, /\/feeds\/items/);
  assert.doesNotMatch(feedsHtml, /JSON<\/a>/);
  assert.doesNotMatch(feedsHtml, /rect x=""/);

  const scriptMatch = feedsHtml.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
  assert.ok(scriptMatch, "expected inline feeds script");
  assert.doesNotMatch(scriptMatch[1], /rect x=""/);
  assert.doesNotThrow(() => new Function(scriptMatch[1]));

  const payload = JSON.parse(readFileSync(join(outDir, "assets", "events.json"), "utf8"));
  assert.equal(payload.events.length, 4);
  assert.equal(typeof payload.exported_at, "string");
  assert.match(payload.events[0].html, /Source/);
  assert.doesNotMatch(payload.events[0].html, /JSON<\/a>/);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
