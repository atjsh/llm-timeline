import assert from "node:assert/strict";
import { parseRssAtom, parseChangelogHtml } from "../dist/sources/parsers.js";

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
const changelog = parseChangelogHtml(html, sourceUrl);

assert.equal(result.length, 1);
assert.equal(result[0].title, "New Model Launch");
assert.equal(result[0].canonicalUrl, "https://example.com/new-model");
assert.equal(changelog.length, 1);
assert.ok(changelog[0].title.includes("January 11, 2024"));
