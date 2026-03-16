import { createHash } from "node:crypto";
import { config } from "../config.js";
import { parseChangelogHtml, parseRssAtom } from "./parsers.js";
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

export const fetchSource = async (
  source: SourceRow,
  since?: string
): Promise<FetchedSourceItem> => {
  const start = Date.now();
  const headers: Record<string, string> = {
    "User-Agent": "llm-timeline/0.1 (+https://example.com)",
  };
  if (source.etag) headers["If-None-Match"] = source.etag;
  if (source.last_modified) headers["If-Modified-Since"] = source.last_modified;

  const response = await retry(() =>
    requestWithTimeout(source.url, {
      headers,
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
  const filtered = since
    ? parsed.filter((item) => {
        if (!item.publishedAt && !item.eventDateHints?.[0]) return false;
        const eventDate = item.publishedAt || item.eventDateHints?.at(0);
        if (!eventDate) return false;
        return eventDate >= `${since}T00:00:00.000Z` && eventDate >= since;
      })
    : parsed;

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
  return [];
};

export const hashSourceItem = (item: ParsedSourceItem) =>
  checksum(`${item.externalId}:${item.title}:${item.summary}:${item.publishedAt ?? ""}`);
