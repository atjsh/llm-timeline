import { createHash } from "node:crypto";
import { config } from "../config.js";
import {
  parseAnthropicApiReleaseNotesHtml,
  parseAnthropicNewsArticleHtml,
  parseChangelogHtml,
  parseGoogleGeminiApiHtml,
  parseGoogleVertexReleaseNotesHtml,
  parseRssAtom,
} from "./parsers.js";
import { type SourceRow, type ParsedSourceItem } from "../types.js";

export interface FetchedSourceItem {
  source: SourceRow;
  items: ParsedSourceItem[];
  notModified: boolean;
  fetchedAt: string;
  etag?: string | null;
  lastModified?: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const retry = async <T>(fn: () => Promise<T>, retries = 3): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries - 1) break;
      await sleep(Math.min(5000, 500 * 2 ** attempt));
    }
  }
  throw lastError;
};

const requestWithTimeout = async (url: string, init: RequestInit, ms: number): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

const checksum = (value: string) => createHash("sha1").update(value).digest("hex");

const anthropicNewsModelSlugRegex = /(^|-)claude-(opus|sonnet|haiku|\d)/i;
const anthropicNewsExtraSlugAllowlist = new Set([
  "100k-context-windows",
  "3-5-models-and-computer-use",
  "claude-3-family",
  "fine-tune-claude-3-haiku",
]);

const filterItemsSince = (items: ParsedSourceItem[], since?: string) =>
  since
    ? items.filter((item) => {
        if (!item.publishedAt && !item.eventDateHints?.[0]) return false;
        const eventDate = item.publishedAt || item.eventDateHints?.at(0);
        if (!eventDate) return false;
        return eventDate >= `${since}T00:00:00.000Z` && eventDate >= since;
      })
    : items;

type SitemapEntry = {
  loc: string;
  lastModified: string | undefined;
};

const parseSitemapEntries = (xml: string): SitemapEntry[] => {
  const entries: SitemapEntry[] = [];
  for (const match of xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)) {
      const block = match[1] ?? "";
      const loc = /<loc>([\s\S]*?)<\/loc>/i.exec(block)?.[1]?.trim();
      const lastModified = /<lastmod>([\s\S]*?)<\/lastmod>/i.exec(block)?.[1]?.trim();
      if (!loc) continue;
      entries.push({
        loc,
        lastModified,
      });
  }
  return entries;
};

const isRelevantAnthropicNewsArticle = (articleUrl: string) => {
  try {
    const { pathname } = new URL(articleUrl);
    const slug = pathname.split("/").filter(Boolean).at(-1) ?? "";
    return anthropicNewsModelSlugRegex.test(slug) || anthropicNewsExtraSlugAllowlist.has(slug);
  } catch {
    return false;
  }
};

const fetchAnthropicNewsSource = async (
  source: SourceRow,
  since: string | undefined,
  sourceHeaders: Record<string, string>,
  pageHeaders: Record<string, string>,
  startedAt: number
): Promise<FetchedSourceItem> => {
  const sitemapUrl = new URL("/sitemap.xml", source.url).toString();
  const sitemapResponse = await retry(() =>
    requestWithTimeout(
      sitemapUrl,
      {
        headers: sourceHeaders,
      },
      config.requestTimeoutMs
    )
  );

  if (sitemapResponse.status === 304) {
    return {
      source,
      items: [],
      notModified: true,
      fetchedAt: new Date(startedAt).toISOString(),
      etag: sitemapResponse.headers.get("etag"),
      lastModified: sitemapResponse.headers.get("last-modified"),
    };
  }

  if (!sitemapResponse.ok) {
    throw new Error(`Fetch failed for ${source.id} (${sitemapUrl}): ${sitemapResponse.status} ${sitemapResponse.statusText}`);
  }

  const sitemap = await sitemapResponse.text();
  const threshold = since ? `${since}T00:00:00.000Z` : source.last_success_at ?? null;
  const origin = new URL(source.url).origin;
  const articleUrls = parseSitemapEntries(sitemap)
    .filter((entry) => entry.loc.startsWith(`${origin}/news/`) && /^https:\/\/www\.anthropic\.com\/news\/[^/]+$/.test(entry.loc))
    .filter((entry) => isRelevantAnthropicNewsArticle(entry.loc))
    .filter((entry) => !threshold || !entry.lastModified || entry.lastModified >= threshold)
    .map((entry) => entry.loc);

  const parsed: ParsedSourceItem[] = [];
  for (let index = 0; index < articleUrls.length; index += 4) {
    const batch = articleUrls.slice(index, index + 4);
    const batchResults = await Promise.all(
      batch.map(async (articleUrl) => {
        try {
          const response = await retry(() =>
            requestWithTimeout(
              articleUrl,
              {
                headers: pageHeaders,
              },
              config.requestTimeoutMs
            )
          );
          if (!response.ok) return [];
          const body = await response.text();
          return parseAnthropicNewsArticleHtml(body, articleUrl);
        } catch {
          return [];
        }
      })
    );
    parsed.push(...batchResults.flat());
  }

  return {
    source,
    items: filterItemsSince(parsed, since),
    notModified: false,
    fetchedAt: new Date(startedAt).toISOString(),
    etag: sitemapResponse.headers.get("etag"),
    lastModified: sitemapResponse.headers.get("last-modified"),
  };
};

export const fetchSource = async (
  source: SourceRow,
  since?: string
): Promise<FetchedSourceItem> => {
  const start = Date.now();
  const baseHeaders: Record<string, string> = {
    "User-Agent": "llm-timeline/0.1 (+https://example.com)",
    "Accept-Language": "en-US,en;q=0.9",
  };
  const sourceHeaders: Record<string, string> = { ...baseHeaders };
  if (source.etag) sourceHeaders["If-None-Match"] = source.etag;
  if (source.last_modified) sourceHeaders["If-Modified-Since"] = source.last_modified;

  if (source.parser === "anthropic_news") {
    return fetchAnthropicNewsSource(source, since, sourceHeaders, baseHeaders, start);
  }

  const response = await retry(() =>
    requestWithTimeout(source.url, {
      headers: sourceHeaders,
    }, config.requestTimeoutMs)
  );

  if (response.status === 304) {
    return {
      source,
      items: [],
      notModified: true,
      fetchedAt: new Date(start).toISOString(),
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
    };
  }

  if (!response.ok) {
    throw new Error(`Fetch failed for ${source.id} (${source.url}): ${response.status} ${response.statusText}`);
  }

  const body = await response.text();
  const parsed = parseSourceBody(source.parser, body, source.url);
  const filtered = filterItemsSince(parsed, since);

  const fetchedAt = new Date(start).toISOString();
  const payload = JSON.stringify(
    {
      sourceId: source.id,
      fetchedAt,
      total: filtered.length,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      sample: body.slice(0, 128),
    },
    null,
    2
  );
  void checksum(payload);
  return {
    source,
    items: filtered,
    notModified: false,
    fetchedAt,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
  };
};

const parseSourceBody = (parser: string, body: string, sourceUrl: string): ParsedSourceItem[] => {
  if (parser === "rss_atom" || parser === "github_releases") {
    return parseRssAtom(body, sourceUrl);
  }
  if (parser === "changelog_html" || parser === "docs_html") {
    return parseChangelogHtml(body, sourceUrl);
  }
  if (parser === "anthropic_api_release_notes_html") {
    return parseAnthropicApiReleaseNotesHtml(body, sourceUrl);
  }
  if (parser === "google_gemini_api_html") {
    return parseGoogleGeminiApiHtml(body, sourceUrl);
  }
  if (parser === "google_vertex_release_notes_html") {
    return parseGoogleVertexReleaseNotesHtml(body, sourceUrl);
  }
  return [];
};

export const hashSourceItem = (item: ParsedSourceItem) =>
  checksum(
    `${item.externalId}:${item.title}:${item.summary}:${item.publishedAt ?? ""}:${(item.feedCategories ?? []).join("|")}:${item.sourceLabel ?? ""}`
  );
