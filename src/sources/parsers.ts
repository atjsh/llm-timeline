import { createHash } from "node:crypto";
import type { ParsedSourceItem } from "../types.js";

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&#(\d+);/g, (_, decimal: string) => {
      const codePoint = Number.parseInt(decimal, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    });

const unwrapCdata = (value: string) => value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");

const stripTags = (value: string) =>
  decodeHtmlEntities(
    decodeHtmlEntities(unwrapCdata(value)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  );

const xmlTag = (block: string, tag: string): string | undefined => {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(block);
  if (!match || !match[1]) return undefined;
  return stripTags(match[1]).trim();
};

const xmlTags = (block: string, tag: string): string[] =>
  [...block.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))]
    .map((match) => stripTags(match[1] ?? "").trim())
    .filter(Boolean);

const xmlCategoryTerms = (block: string): string[] =>
  [...block.matchAll(/<category\b[^>]*term=\"([^\"]+)\"[^>]*\/?>/gi)]
    .map((match) => decodeHtmlEntities(match[1] ?? "").trim())
    .filter(Boolean);

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

const resolveUrl = (baseUrl: string, value: string) => {
  try {
    const url = new URL(value, baseUrl);
    url.searchParams.delete("hl");
    return url.toString();
  } catch {
    return value;
  }
};

const firstLinkFrom = (value: string, baseUrl: string) => {
  const links = [...value.matchAll(/href=\"([^\"]+)\"/gi)]
    .map((match) => resolveUrl(baseUrl, decodeHtmlEntities(match[1] ?? "").trim()))
    .filter(Boolean);
  const preferred = links.find((link) => !/products#product-launch-stages/i.test(link));
  return preferred ?? links[0];
};

const sectionIdFrom = (heading: string) => {
  const match = /id=\"([^\"]+)\"/i.exec(heading);
  return match?.[1]?.trim() || undefined;
};

const topLevelListItems = (value: string) => {
  const items: string[] = [];
  const tagRegex = /<\/?(ul|li)\b[^>]*>/gi;
  let listDepth = 0;
  let itemDepth = 0;
  let currentStart: number | null = null;
  let tag: RegExpExecArray | null;
  while ((tag = tagRegex.exec(value)) !== null) {
    const isClosing = tag[0].startsWith("</");
    const tagName = tag[1].toLowerCase();
    if (tagName === "ul") {
      listDepth += isClosing ? -1 : 1;
      continue;
    }
    if (!isClosing) {
      itemDepth += 1;
      if (listDepth === 1 && itemDepth === 1) {
        currentStart = tagRegex.lastIndex;
      }
      continue;
    }
    if (listDepth === 1 && itemDepth === 1 && currentStart !== null) {
      items.push(value.slice(currentStart, tag.index));
      currentStart = null;
    }
    itemDepth = Math.max(0, itemDepth - 1);
  }
  return items;
};

const divBlocksByClass = (value: string, className: string) => {
  const blocks: string[] = [];
  const startRegex = new RegExp(`<div\\b[^>]*class=\"[^\"]*${className}[^\"]*\"[^>]*>`, "gi");
  const tagRegex = /<\/?div\b[^>]*>/gi;
  let startMatch: RegExpExecArray | null;
  while ((startMatch = startRegex.exec(value)) !== null) {
    tagRegex.lastIndex = startRegex.lastIndex;
    let depth = 1;
    let tag: RegExpExecArray | null;
    while ((tag = tagRegex.exec(value)) !== null) {
      depth += tag[0].startsWith("</") ? -1 : 1;
      if (depth === 0) {
        blocks.push(value.slice(startMatch.index, tagRegex.lastIndex));
        startRegex.lastIndex = tagRegex.lastIndex;
        break;
      }
    }
  }
  return blocks;
};

const titleFromText = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "Untitled";
  const sentence = trimmed
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((part) => part.trim())
    .find(Boolean);
  if (!sentence) return trimmed.slice(0, 120);
  return sentence.length <= 140 ? sentence : sentence.slice(0, 137).trimEnd() + "...";
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
  feedCategories?: string[];
  sourceLabel?: string;
}) => ({
  externalId: input.externalId ?? normalizeItemId(`${input.sourceUrl}:${input.title}`, input.sourceName),
  title: input.title ?? input.summary.slice(0, 80),
  canonicalUrl: input.canonicalUrl ?? input.sourceUrl,
  summary: input.summary,
  publishedAt: parseDateMaybe(input.publishedAt),
  eventDateHints: input.hints,
  feedCategories: input.feedCategories,
  sourceLabel: input.sourceLabel,
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
    const feedCategories = [...new Set([...xmlTags(block, "category"), ...xmlCategoryTerms(block)])];
    results.push(
      itemFrom({
        sourceUrl,
        sourceName: sourceUrl,
        externalId: guid || link,
        title,
        canonicalUrl: link,
        summary,
        publishedAt: pubDate || undefined,
        feedCategories,
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

const parseHeadingSections = (html: string, headingTag: "h2" | "h3") => {
  const matches = [...html.matchAll(new RegExp(`<${headingTag}\\b[^>]*>[\\s\\S]*?<\\/${headingTag}>`, "gi"))];
  return matches.map((match, index) => {
    const heading = match[0];
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? html.length : html.length;
    return {
      heading,
      sectionBody: html.slice(start + heading.length, end),
      dateText: stripTags(heading),
      sectionId: sectionIdFrom(heading),
    };
  });
};

const parseDateSections = (html: string) => parseHeadingSections(html, "h2");

const parseSectionPublishedAt = (dateText: string, sectionId?: string) => {
  const direct = parseDateMaybe(dateText);
  if (direct) return direct;
  if (sectionId && /^\d{2}-\d{2}-\d{4}$/.test(sectionId)) {
    const [month, day, year] = sectionId.split("-");
    return parseDateMaybe(`${year}-${month}-${day}`);
  }
  if (sectionId) {
    const fromId = parseDateMaybe(sectionId.replace(/_/g, " "));
    if (fromId) return fromId;
  }
  return undefined;
};

export const parseGoogleGeminiApiHtml = (html: string, sourceUrl: string): ParsedSourceItem[] => {
  const sections = parseDateSections(html);
  const parsed: ParsedSourceItem[] = [];
  for (const section of sections) {
    const publishedAt = parseSectionPublishedAt(section.dateText, section.sectionId);
    if (!publishedAt) continue;
    const lists = [...section.sectionBody.matchAll(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi)];
    if (!lists.length) continue;
    const entries = topLevelListItems(lists[0][0] ?? "");
    for (const [index, entry] of entries.entries()) {
      const summary = stripTags(entry);
      if (!summary) continue;
      const canonicalUrl =
        firstLinkFrom(entry, sourceUrl) ?? `${sourceUrl}#${section.sectionId ?? publishedAt}-${index + 1}`;
      parsed.push(
        itemFrom({
          sourceUrl,
          sourceName: sourceUrl,
          externalId: normalizeItemId(`${section.sectionId ?? publishedAt}:${index + 1}:${summary}`, canonicalUrl),
          title: titleFromText(summary),
          canonicalUrl,
          summary,
          publishedAt,
          hints: [publishedAt],
          sourceLabel: /deprecat|shut down/i.test(summary) ? "Deprecated" : "Feature",
        })
      );
    }
  }
  return parsed;
};

export const parseGoogleVertexReleaseNotesHtml = (html: string, sourceUrl: string): ParsedSourceItem[] => {
  const sections = parseDateSections(html);
  const parsed: ParsedSourceItem[] = [];
  for (const section of sections) {
    const publishedAt = parseSectionPublishedAt(section.dateText, section.sectionId);
    if (!publishedAt) continue;
    const notes = divBlocksByClass(section.sectionBody, "devsite-release-note");
    for (const [index, note] of notes.entries()) {
      const label = stripTags(/<span\b[^>]*devsite-label-release-[^>]*>([\s\S]*?)<\/span>/i.exec(note)?.[1] ?? "");
      const body = note.replace(/<span\b[^>]*devsite-label-release-[^>]*>[\s\S]*?<\/span>/i, "");
      const summary = stripTags(body);
      if (!summary) continue;
      const strongTitle = stripTags(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i.exec(body)?.[1] ?? "");
      const title = strongTitle || titleFromText(summary);
      const canonicalUrl =
        firstLinkFrom(body, sourceUrl) ?? `${sourceUrl}#${section.sectionId ?? publishedAt}-${index + 1}`;
      parsed.push(
        itemFrom({
          sourceUrl,
          sourceName: sourceUrl,
          externalId: normalizeItemId(`${section.sectionId ?? publishedAt}:${index + 1}:${title}`, canonicalUrl),
          title,
          canonicalUrl,
          summary,
          publishedAt,
          hints: [publishedAt],
          sourceLabel: label || undefined,
        })
      );
    }
  }
  return parsed;
};

const textBlocksFrom = (value: string, limit = 8) => {
  const blocks = [
    ...[...value.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => stripTags(match[1] ?? "")),
    ...[...value.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => stripTags(match[1] ?? "")),
  ]
    .map((entry) => entry.trim())
    .filter(Boolean);
  return blocks.slice(0, limit);
};

export const parseAnthropicNewsArticleHtml = (html: string, sourceUrl: string): ParsedSourceItem[] => {
  const sanitized = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const title = stripTags(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(sanitized)?.[1] ?? "");
  if (!title) return [];

  const subject = stripTags(
    /<div\b[^>]*class=\"[^\"]*subjects[^\"]*\"[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/i.exec(sanitized)?.[1] ?? ""
  );
  const publishedAt =
    parseDateMaybe(/<div\b[^>]*class=\"[^\"]*agate[^\"]*\">([\s\S]*?)<\/div>/i.exec(sanitized)?.[1]?.trim()) ??
    parseDateMaybe(/\"publishedOn\":\"([^\"]+)\"/i.exec(sanitized)?.[1]?.trim());

  const bodyMatch = /<div\b[^>]*class=\"Body-module[^\"]*__body[^\"]*\"[^>]*>/i.exec(sanitized);
  const bodyStart = bodyMatch ? (bodyMatch.index ?? 0) + bodyMatch[0].length : -1;
  const remainder = bodyStart >= 0 ? sanitized.slice(bodyStart) : sanitized;
  const headingIndex = remainder.search(/<h2\b[^>]*class=\"[^\"]*post-heading[^\"]*\"/i);
  const articleEnd = remainder.search(/<\/article>/i);
  const introSegment =
    headingIndex >= 0
      ? remainder.slice(0, headingIndex)
      : articleEnd >= 0
      ? remainder.slice(0, articleEnd)
      : remainder;
  const summaryBlocks = textBlocksFrom(introSegment, 10);
  const summary = summaryBlocks.join(" ").trim() || stripTags(introSegment).slice(0, 1600).trim();

  if (!summary) return [];

  return [
    itemFrom({
      sourceUrl,
      sourceName: sourceUrl,
      externalId: sourceUrl,
      title,
      canonicalUrl: sourceUrl,
      summary,
      publishedAt,
      hints: publishedAt ? [publishedAt] : undefined,
      feedCategories: subject ? [subject] : undefined,
    }),
  ];
};

export const parseAnthropicApiReleaseNotesHtml = (html: string, sourceUrl: string): ParsedSourceItem[] => {
  const sanitized = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const sections = parseHeadingSections(sanitized, "h3");
  const parsed: ParsedSourceItem[] = [];

  for (const section of sections) {
    const publishedAt = parseSectionPublishedAt(section.dateText, section.sectionId);
    if (!publishedAt) continue;
    const lists = [...section.sectionBody.matchAll(/<ul\b[^>]*>[\s\S]*?<\/ul>/gi)];
    if (!lists.length) continue;

    let itemIndex = 0;
    for (const list of lists) {
      const entries = topLevelListItems(list[0] ?? "");
      for (const entry of entries) {
        itemIndex += 1;
        const summary = stripTags(entry);
        if (!summary) continue;
        const canonicalUrl =
          firstLinkFrom(entry, sourceUrl) ?? `${sourceUrl}#${section.sectionId ?? publishedAt}-${itemIndex}`;
        parsed.push(
          itemFrom({
            sourceUrl,
            sourceName: sourceUrl,
            externalId: normalizeItemId(`${section.sectionId ?? publishedAt}:${itemIndex}`, canonicalUrl),
            title: titleFromText(summary),
            canonicalUrl,
            summary,
            publishedAt,
            hints: [publishedAt],
          })
        );
      }
    }
  }

  return parsed;
};
