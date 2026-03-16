import { createHash } from "node:crypto";
import type { ParsedSourceItem } from "../types.js";

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const stripTags = (value: string) => decodeHtmlEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

const xmlTag = (block: string, tag: string): string | undefined => {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(block);
  if (!match || !match[1]) return undefined;
  return stripTags(match[1]).trim();
};

const parseDateMaybe = (value?: string) => {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return undefined;
  return new Date(parsed).toISOString();
};

const normalizeItemId = (seed: string, fallback: string) => {
  const hash = createHash("sha1").update(seed).digest("hex");
  return `${fallback}:${hash}`;
};

const itemFrom = (input: {
  sourceUrl: string;
  sourceName: string;
  externalId?: string;
  title?: string;
  canonicalUrl?: string;
  summary: string;
  publishedAt?: string;
  hints?: string[];
}) => ({
  externalId: input.externalId ?? normalizeItemId(`${input.sourceUrl}:${input.title}`, input.sourceName),
  title: input.title ?? input.summary.slice(0, 80),
  canonicalUrl: input.canonicalUrl ?? input.sourceUrl,
  summary: input.summary,
  publishedAt: parseDateMaybe(input.publishedAt),
  eventDateHints: input.hints,
});

export const parseRssAtom = (xml: string, sourceUrl: string): ParsedSourceItem[] => {
  const entries = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi), ...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)];
  if (!entries.length) return [];
  const results: ParsedSourceItem[] = [];
  for (const entry of entries) {
    const block = entry[0];
    const title = xmlTag(block, "title") || "Untitled";
    const linkMatch = /<link[^>]*>([\s\S]*?)<\/link>/i.exec(block);
    const linkAttr = /<link[^>]+href=\"([^\"]+)\"/i.exec(block);
    const guid = xmlTag(block, "guid") || xmlTag(block, "id") || "";
    const link =
      (linkAttr?.[1] ?? (linkMatch?.[1] ? stripTags(linkMatch[1]) : "")) || sourceUrl;
    const pubDate = xmlTag(block, "pubDate") || xmlTag(block, "updated") || xmlTag(block, "published");
    const summary = xmlTag(block, "description") || xmlTag(block, "summary") || xmlTag(block, "content") || "";
    results.push(
      itemFrom({
        sourceUrl,
        sourceName: sourceUrl,
        externalId: guid || link,
        title,
        canonicalUrl: link,
        summary,
        publishedAt: pubDate || undefined,
      })
    );
  }
  return results;
};

const lineDateCandidates = (text: string) => {
  const matches = [];
  const dateRegex = /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2}|(?:\d{1,2})[\\/-](?:\d{1,2})[\\/-]\d{2,4})/gi;
  let match: RegExpExecArray | null;
  while ((match = dateRegex.exec(text)) !== null) {
    const parsed = parseDateMaybe(match[1]);
    if (parsed) matches.push(parsed);
  }
  return matches;
};

export const parseChangelogHtml = (html: string, sourceUrl: string): ParsedSourceItem[] => {
  const sanitized = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const sectionRegex = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>([\s\S]*?)(?=<h[1-6]|$)/gi;
  const parsed: ParsedSourceItem[] = [];
  let sectionIndex = 0;
  let section: RegExpExecArray | null;
  while ((section = sectionRegex.exec(sanitized)) !== null) {
    sectionIndex += 1;
    const rawTitle = stripTags(section[1]);
    const body = stripTags(section[2]).trim();
    if (!rawTitle && !body) continue;
    const maybeDate = lineDateCandidates(rawTitle).at(0);
    const hints = maybeDate ? [maybeDate] : lineDateCandidates(body);
    const title = rawTitle || body.slice(0, 100);
    const sourceLine = `${sourceUrl}#${sectionIndex}`;
    parsed.push(
      itemFrom({
        sourceUrl,
        sourceName: sourceUrl,
        externalId: normalizeItemId(`${sourceLine}:${title}`, sourceLine),
        title,
        canonicalUrl: sourceLine,
        summary: body || rawTitle,
        publishedAt: maybeDate,
        hints,
      })
    );
  }
  if (parsed.length === 0) {
    const bodyText = stripTags(sanitized);
    const hints = lineDateCandidates(bodyText);
    parsed.push(
      itemFrom({
        sourceUrl,
        sourceName: sourceUrl,
        externalId: normalizeItemId(sourceUrl, sourceUrl),
        title: sourceUrl,
        canonicalUrl: sourceUrl,
        summary: bodyText.slice(0, 280),
        publishedAt: hints.at(0),
        hints,
      })
    );
  }
  return parsed;
};
