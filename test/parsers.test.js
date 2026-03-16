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
