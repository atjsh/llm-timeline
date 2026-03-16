import assert from "node:assert/strict";
import {
  parseAnthropicApiReleaseNotesHtml,
  parseAnthropicNewsArticleHtml,
  parseChangelogHtml,
  parseGoogleGeminiApiHtml,
  parseGoogleVertexReleaseNotesHtml,
  parseRssAtom,
} from "../dist/sources/parsers.js";

const rss = `
  <rss>
    <channel>
      <item>
        <title>New Model Launch</title>
        <link>https://example.com/new-model</link>
        <pubDate>Wed, 01 Jan 2024 10:00:00 GMT</pubDate>
        <description>OpenAI model update</description>
      </item>
    </channel>
  </rss>
`;

const rssWithCdata = `
  <rss>
    <channel>
      <item>
        <title><![CDATA[Introducing GPT-5.4]]></title>
        <link>https://example.com/gpt-5-4</link>
        <pubDate>Thu, 05 Mar 2026 10:00:00 GMT</pubDate>
        <description><![CDATA[OpenAI launches a new model family.]]></description>
      </item>
    </channel>
  </rss>
`;

const html = `
  <html>
    <body>
      <h2>January 11, 2024 — Platform Update</h2>
      <p>Notes about release timeline.</p>
    </body>
  </html>
`;

const sourceUrl = "https://example.com/source";

const result = parseRssAtom(rss, sourceUrl);
const cdataResult = parseRssAtom(rssWithCdata, sourceUrl);
const changelog = parseChangelogHtml(html, sourceUrl);

assert.equal(result.length, 1);
assert.equal(result[0].title, "New Model Launch");
assert.equal(result[0].canonicalUrl, "https://example.com/new-model");
assert.deepEqual(result[0].feedCategories, []);
assert.equal(cdataResult.length, 1);
assert.equal(cdataResult[0].title, "Introducing GPT-5.4");
assert.equal(cdataResult[0].summary, "OpenAI launches a new model family.");
assert.deepEqual(cdataResult[0].feedCategories, []);
assert.equal(changelog.length, 1);
assert.ok(changelog[0].title.includes("January 11, 2024"));

const rssWithCategory = `
  <rss>
    <channel>
      <item>
        <title><![CDATA[Introducing GPT-5.4]]></title>
        <link>https://example.com/gpt-5-4</link>
        <pubDate>Thu, 05 Mar 2026 10:00:00 GMT</pubDate>
        <description><![CDATA[OpenAI launches a new model family.]]></description>
        <category><![CDATA[Product]]></category>
      </item>
    </channel>
  </rss>
`;

const categoryResult = parseRssAtom(rssWithCategory, sourceUrl);
assert.deepEqual(categoryResult[0].feedCategories, ["Product"]);

const rssWithEncodedHtml = `
  <rss>
    <channel>
      <item>
        <title>Gemini 3.1 Flash-Lite</title>
        <link>https://example.com/gemini-3-1-flash-lite</link>
        <description>&lt;img src="https://example.com/image.png"&gt;Gemini 3.1 Flash-Lite is our fastest model yet.</description>
      </item>
    </channel>
  </rss>
`;

const encodedHtmlResult = parseRssAtom(rssWithEncodedHtml, sourceUrl);
assert.equal(encodedHtmlResult[0].summary, "Gemini 3.1 Flash-Lite is our fastest model yet.");

const googleGeminiApiHtml = `
  <html>
    <body>
      <h2 data-text="Ngày 19 tháng 2 năm 2026" id="02-19-2026">Ngày 19 tháng 2 năm 2026</h2>
      <ul>
        <li>Released <a href="/gemini-api/docs/models/gemini-3.1-pro-preview?hl=bn">Gemini 3.1 Pro Preview</a>, our latest iteration in the Gemini 3 series.</li>
        <li>Launched a separate endpoint <code>gemini-3.1-pro-preview-customtools</code>, which is better at prioritizing custom tools.</li>
      </ul>
    </body>
  </html>
`;

const googleVertexHtml = `
  <html>
    <body>
      <h2 id="February_19_2026">February 19, 2026</h2>
      <div class="devsite-release-note">
        <span class="devsite-label devsite-label-release-feature">Feature</span>
        <div>
          <p><strong>Gemini 3.1 Pro Preview</strong></p>
          <p><a href="/vertex-ai/generative-ai/docs/models/gemini/3-1-pro">Gemini 3.1 Pro</a> is available in preview in Model Garden.</p>
        </div>
      </div>
      <div class="devsite-release-note">
        <span class="devsite-label devsite-label-release-deprecated">Deprecated</span>
        <div>
          <p><strong>Anthropic's Claude 3 Haiku</strong></p>
          <p>Anthropic's Claude 3 Haiku is deprecated as of February 23, 2026.</p>
        </div>
      </div>
    </body>
  </html>
`;

const googleGeminiApiResult = parseGoogleGeminiApiHtml(googleGeminiApiHtml, "https://ai.google.dev/gemini-api/docs/changelog");
assert.equal(googleGeminiApiResult.length, 2);
assert.match(googleGeminiApiResult[0].title, /Gemini 3\.1 Pro Preview/i);
assert.equal(googleGeminiApiResult[0].canonicalUrl, "https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview");
assert.equal(googleGeminiApiResult[0].sourceLabel, "Feature");

const googleVertexResult = parseGoogleVertexReleaseNotesHtml(
  googleVertexHtml,
  "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes"
);
assert.equal(googleVertexResult.length, 2);
assert.equal(googleVertexResult[0].title, "Gemini 3.1 Pro Preview");
assert.equal(
  googleVertexResult[0].canonicalUrl,
  "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-1-pro"
);
assert.equal(googleVertexResult[0].sourceLabel, "Feature");
assert.equal(googleVertexResult[1].sourceLabel, "Deprecated");

const anthropicNewsHtml = `
  <html>
    <body>
      <main id="main-content">
        <article>
          <div class="PostDetail-module-scss-module__hero">
            <div class="PostDetail-module-scss-module__header">
              <div class="PostDetail-module-scss-module__subjects"><span>Announcements</span></div>
              <h1>Introducing Claude Opus 4.6</h1>
              <div class="body-3 agate">Feb 5, 2026</div>
            </div>
          </div>
          <div class="Body-module-scss-module__body" data-theme="ivory">
            <p>We’re upgrading our smartest model.</p>
            <p>Opus 4.6 features a 1M token context window in beta.</p>
            <p>Claude Opus 4.6 is available today on claude.ai, our API, and all major cloud platforms.</p>
            <h2 class="post-heading" id="first-impressions">First impressions</h2>
            <p>Additional body content not needed in the summary.</p>
          </div>
        </article>
      </main>
    </body>
  </html>
`;

const anthropicApiReleaseNotesHtml = `
  <html>
    <body>
      <main id="docs-scroll-container">
        <article>
          <h3 id="march-13-2026">
            <button>
              <div>March 13, 2026</div>
            </button>
          </h3>
          <ul>
            <li>The <a href="/docs/en/build-with-claude/context-windows">1M token context window</a> is now generally available for Claude Opus 4.6 and Sonnet 4.6 at standard pricing.</li>
            <li>We&#x27;ve removed the dedicated 1M rate limits for all supported models.</li>
          </ul>
        </article>
      </main>
    </body>
  </html>
`;

const anthropicNewsResult = parseAnthropicNewsArticleHtml(anthropicNewsHtml, "https://www.anthropic.com/news/claude-opus-4-6");
assert.equal(anthropicNewsResult.length, 1);
assert.equal(anthropicNewsResult[0].title, "Introducing Claude Opus 4.6");
assert.equal(anthropicNewsResult[0].publishedAt, "2026-02-05T00:00:00.000Z");
assert.equal(anthropicNewsResult[0].canonicalUrl, "https://www.anthropic.com/news/claude-opus-4-6");
assert.match(anthropicNewsResult[0].summary, /1M token context window in beta/i);
assert.deepEqual(anthropicNewsResult[0].feedCategories, ["Announcements"]);

const anthropicApiResult = parseAnthropicApiReleaseNotesHtml(
  anthropicApiReleaseNotesHtml,
  "https://platform.claude.com/docs/en/release-notes/overview"
);
assert.equal(anthropicApiResult.length, 2);
assert.equal(anthropicApiResult[0].publishedAt, "2026-03-13T00:00:00.000Z");
assert.equal(anthropicApiResult[0].canonicalUrl, "https://platform.claude.com/docs/en/build-with-claude/context-windows");
assert.match(anthropicApiResult[0].title, /1M token context window/i);
assert.match(anthropicApiResult[1].title, /^We've removed the dedicated 1M rate limits/i);
