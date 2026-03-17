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
  {
    id: "unused-source",
    vendor: "openai",
    name: "Unused Source",
    url: "https://example.com/unused.xml",
    parser: "rss_atom",
    enabled: false,
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
  assert.match(
    rootHtml,
    /font-family: -apple-system, BlinkMacSystemFont, avenir next, avenir,\s*segoe ui, helvetica neue, helvetica, Cantarell, Ubuntu, roboto, noto,\s*arial, sans-serif;/
  );
  assert.doesNotMatch(rootHtml, /font-family: "Georgia", "Times New Roman", serif;/);
  assert.doesNotMatch(rootHtml, /linear-gradient\(180deg/);
  assert.doesNotMatch(rootHtml, /box-shadow:/);

  const feedsHtml = readFileSync(join(outDir, "feeds", "index.html"), "utf8");
  assert.match(feedsHtml, /<html lang="ko">/);
  assert.match(feedsHtml, /LLM API 타임라인/);
  assert.match(feedsHtml, /내보낸 날짜 \d{4}년 \d{1,2}월 \d{1,2}일/);
  assert.match(feedsHtml, /https:\/\/github\.com\/atjsh\/llm-timeline/);
  assert.match(feedsHtml, /GitHub \(소스 코드\)/);
  assert.match(feedsHtml, /Node\.js 스크립트가 RSS\/Atom 피드, GitHub 릴리스, HTML 변경 로그 페이지, Anthropic 사이트맵 크롤링에서 데이터를 수집합니다\./);
  assert.match(feedsHtml, /<code>events\.json<\/code>/);
  assert.match(feedsHtml, /<details class="hero__sources">/);
  assert.match(feedsHtml, /<summary>이 스냅샷에 사용된 소스 \(3\)<\/summary>/);
  assert.match(feedsHtml, /OpenAI Blog/);
  assert.match(feedsHtml, /Anthropic Releases/);
  assert.match(feedsHtml, /Google Gemini API Changelog/);
  assert.match(feedsHtml, /https:\/\/openai\.com\/news\/rss\.xml/);
  assert.match(feedsHtml, /https:\/\/platform\.claude\.com\/docs\/en\/release-notes\/overview/);
  assert.match(feedsHtml, /https:\/\/ai\.google\.dev\/gemini-api\/docs\/changelog/);
  assert.match(feedsHtml, /Official Gemini API changelog with model launches, rollouts, and deprecations\./);
  assert.doesNotMatch(feedsHtml, /Unused Source/);
  assert.match(feedsHtml, /\*,\s*\*::before,\s*\*::after\s*\{\s*box-sizing: border-box;/);
  assert.match(
    feedsHtml,
    /font-family: -apple-system, BlinkMacSystemFont, avenir next, avenir, segoe ui, helvetica neue, helvetica, Cantarell, Ubuntu, roboto, noto, arial, sans-serif;/
  );
  assert.match(
    feedsHtml,
    /\.hero,\s*\.controls,\s*\.chart-shell,\s*\.summary,\s*\.timeline-shell\s*\{[\s\S]*background: var\(--surface\);[\s\S]*border-radius: 16px;/
  );
  assert.match(feedsHtml, /\.hero\s*\{[\s\S]*background: var\(--surface-strong\);/);
  assert.match(feedsHtml, /\.event-card\s*\{[\s\S]*border-radius: 14px;[\s\S]*background: rgba\(255, 255, 255, 0\.24\);/);
  assert.match(feedsHtml, /--timeline-axis-left: 20px;/);
  assert.match(feedsHtml, /--timeline-date-width: 132px;/);
  assert.match(feedsHtml, /--timeline-gutter-width: 56px;/);
  assert.match(
    feedsHtml,
    /left: calc\(var\(--timeline-axis-left\) \+ \(var\(--timeline-axis-width\) \/ 2\) - \(var\(--timeline-marker-size\) \/ 2\)\);/
  );
  assert.match(
    feedsHtml,
    /@media \(min-width: 720px\)[\s\S]*--timeline-axis-left: calc\(var\(--timeline-date-width\) \+ \(var\(--timeline-gutter-width\) \/ 2\) - \(var\(--timeline-axis-width\) \/ 2\)\);/
  );
  assert.match(
    feedsHtml,
    /@media \(min-width: 720px\)[\s\S]*grid-template-columns: var\(--timeline-date-width\) var\(--timeline-gutter-width\) minmax\(0, 1fr\);/
  );
  assert.match(feedsHtml, /\.event-card\s*\{[\s\S]*grid-column: 3;/);
  assert.match(feedsHtml, /히트맵/);
  assert.match(feedsHtml, /날짜별 릴리스 활동/);
  assert.match(feedsHtml, /data-chart-root/);
  assert.match(feedsHtml, /data-chart-scroll/);
  assert.match(feedsHtml, /data-chart-day="2026-03-10"/);
  assert.match(feedsHtml, /heatmap__grid/);
  assert.match(feedsHtml, /data-data-href="\.\.\/assets\/events\.json"/);
  assert.match(feedsHtml, /data-feeds-form/);
  assert.match(feedsHtml, /OpenAI Alpha/);
  assert.match(feedsHtml, /Introducing Claude Opus 4\.6/);
  assert.doesNotMatch(feedsHtml, /font-family: "Georgia", "Times New Roman", serif;/);
  assert.doesNotMatch(feedsHtml, /backdrop-filter:/);
  assert.doesNotMatch(feedsHtml, /linear-gradient\(180deg/);
  assert.doesNotMatch(feedsHtml, /box-shadow:/);
  assert.doesNotMatch(feedsHtml, /Current JSON/);
  assert.doesNotMatch(feedsHtml, /Current ICS/);
  assert.doesNotMatch(feedsHtml, /Source Status/);
  assert.match(feedsHtml, /더 보기/);
  assert.match(feedsHtml, /원문/);
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
  assert.match(payload.events[0].html, /원문/);
  assert.match(payload.events[0].html, /제품:|모델:/);
  assert.doesNotMatch(payload.events[0].html, /JSON<\/a>/);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
