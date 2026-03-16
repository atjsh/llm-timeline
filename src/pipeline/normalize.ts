import { createHash } from "node:crypto";
import type { EventCategory, EventDateKind, DatePrecision, ParsedSourceItem, SourceRow } from "../types.js";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 120);

const truncate = (value: string, length: number) =>
  value.length <= length ? value : `${value.slice(0, length - 3)}...`;

const normalizeDate = (value: string): { iso: string; precision: DatePrecision } | null => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  const date = new Date(parsed);
  if (Number.isNaN(date.getTime())) return null;
  const hasTime = /[T\s]\d{1,2}:\d{2}/.test(value);
  return {
    iso: hasTime ? date.toISOString() : date.toISOString().slice(0, 10),
    precision: hasTime ? "datetime" : "date",
  };
};

const monthNameToDate = (value: string) => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
};

const knownProducts = [
  "chatgpt",
  "gpt",
  "gpt-4",
  "gpt-4o",
  "gpt-3.5",
  "gpt-4.1",
  "o1",
  "dall-e",
  "whisper",
  "sora",
  "claude",
  "sonnet",
  "opus",
  "haiku",
  "gemini",
  "palm",
  "vertex ai",
  "aiplatform",
  "gemini api",
  "ai studio",
];

const knownModels = [
  "gpt-4",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-3.5-turbo",
  "gpt-4.1",
  "o1-preview",
  "o1-mini",
  "dall-e",
  "whisper-2",
  "claude-3-opus",
  "claude-3-sonnet",
  "claude-3-haiku",
  "claude-3-5-sonnet",
  "gemini-1.5",
  "gemini-2.0",
];

type DateCandidate = {
  date: string;
  kind: EventDateKind;
};

const dateRegex = /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}-\d{1,2}-\d{4})/gi;

const dateKindFromContext = (context: string): EventDateKind => {
  const lower = context.toLowerCase();
  if (lower.includes("deprecat")) return "deprecation";
  if (lower.includes("rollout") || lower.includes("roll out") || lower.includes("availability")) return "rollout";
  if (lower.includes("effective")) return "effective";
  if (lower.includes("release")) return "release";
  return "published";
};

const extractDateCandidates = (text: string): DateCandidate[] => {
  const lower = text.toLowerCase();
  const candidates: DateCandidate[] = [];
  let match: RegExpExecArray | null;
  while ((match = dateRegex.exec(lower)) !== null) {
    const hit = match[1];
    const normalized = monthNameToDate(match[0]) ? normalizeDate(match[0]) : normalizeDate(hit);
    if (!normalized) continue;
    const windowStart = Math.max(0, match.index - 80);
    const windowEnd = Math.min(text.length, match.index + hit.length + 80);
    const context = text.slice(windowStart, windowEnd);
    const kind = dateKindFromContext(context);
    candidates.push({
      date: normalized.iso,
      kind,
    });
  }
  return candidates;
};

const dedupe = <T>(items: T[], key: (value: T) => string): T[] => {
  const map = new Map<string, T>();
  for (const value of items) {
    map.set(key(value), value);
  }
  return [...map.values()];
};

const inferCategory = (source: SourceRow, text: string, base: EventCategory): EventCategory => {
  const lower = text.toLowerCase();
  if (lower.includes("deprecat")) return "deprecation";
  if (lower.includes("rollout") || lower.includes("roll out") || lower.includes("launch") || lower.includes("available")) return "model_rollout";
  if (lower.includes("release notes") || lower.includes("changelog") || source.default_category === "release_note") return "release_note";
  if (lower.includes("guide") || lower.includes("documentation") || lower.includes("docs")) return "tech_guide";
  if (lower.includes("model") && (lower.includes("release") || lower.includes("introduce") || lower.includes("announc"))) return "model_release";
  return base;
};

const extractTerms = (text: string, vocabulary: string[]) =>
  vocabulary.filter((value) => text.toLowerCase().includes(value.toLowerCase()));

export const normalizeSourceItems = (source: SourceRow, items: ParsedSourceItem[]) => {
  const normalized = [];
  const vendorProducts = extractTerms(`${source.vendor} ${source.name}`, knownProducts);
  for (const item of items) {
    const combined = `${item.title}\n${item.summary}`.trim();
    const candidates = dedupe(extractDateCandidates(`${combined} ${item.externalId}`), (candidate) => `${candidate.date}-${candidate.kind}`);
    const dateRefs = candidates.length
      ? candidates.map((c) => c.date).filter((value, index, arr) => arr.indexOf(value) === index)
      : item.publishedAt
      ? [item.publishedAt]
      : [];
    const category = inferCategory(source, combined, source.default_category);
    const productHints = dedupe(extractTerms(combined, knownProducts.concat(vendorProducts)), (v) => v).sort();
    const modelHints = dedupe(extractTerms(combined, knownModels), (v) => v).sort();
    const tags = dedupe(
      [category, source.vendor, source.name]
        .concat(category === "release_note" ? ["changelog"] : [])
        .map((value) => value),
      (value) => value
    );

    const dateKinds = candidates.length ? candidates : [{ date: dateRefs.at(0) || new Date().toISOString().slice(0, 10), kind: "published" as EventDateKind }];
    const usedMilestones = new Set<string>();
    for (const dateRef of dateKinds) {
      const date = dateRef.date;
      const kind = dateRef.kind;
      const anchorBase = slugify(`${item.title} ${kind} ${date}`);
      if (usedMilestones.has(anchorBase)) continue;
      usedMilestones.add(anchorBase);

      const normalizedDate = normalizeDate(date) || { iso: new Date().toISOString().slice(0, 10), precision: "date" as DatePrecision };
      const evidenceExcerpt = truncate(item.summary.replace(/\s+/g, " "), 240);
      const canonicalUrl = item.canonicalUrl.trim();
      const id = createHash("sha1")
        .update(`${canonicalUrl}|${source.vendor}|${category}|${normalizedDate.iso}|${anchorBase}`)
        .digest("hex");

      normalized.push({
        id,
        vendor: source.vendor,
        category,
        title: item.title,
        summary: item.summary,
        canonicalUrl,
        evidenceUrl: source.url,
        evidenceExcerpt,
        publishedAt: item.publishedAt,
        eventDate: normalizedDate.iso,
        eventDateKind: kind,
        datePrecision: normalizedDate.precision,
        products: productHints,
        models: modelHints,
        tags,
        anchor: anchorBase,
      });
    }
  }
  return normalized;
};
