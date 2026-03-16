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

const dateRegex =
  /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}-\d{1,2}-\d{4})\b/gi;

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

const normalizeFeedCategories = (categories: string[] | undefined) => (categories ?? []).map((value) => value.toLowerCase().trim());

const normalizeCanonicalUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
};

const openAiModelReleaseTitleRegex =
  /\b(hello gpt-[a-z0-9.-]+|introducing gpt-[a-z0-9.-]+|introducing gpt-oss-[a-z0-9.-]+|introducing o[0-9][a-z0-9.-]*|introducing sora(?:\s*\d+(?:\.\d+)?)?|new embedding models?|new and improved embedding model|new models and developer products announced at devday|function calling and other api updates)\b/i;

const openAiNonReleaseTitleRegex =
  /\b(system card|technical report|partnership|agreement|acquire|acquisition|research partnership|forum|red teaming network)\b/i;

const openAiDirectRetirementTitleRegex =
  /^(?:retiring|deprecating)\b|^(?:retirement|deprecation)\s+of\b/i;

const openAiRetirementEntityRegex =
  /\b(gpt-[a-z0-9.-]+|gpt|o[0-9][a-z0-9.-]*|chatgpt|embedding(?:s)?|model(?:s)?)\b/i;

const openAiRetirementUrlHints = ["/index/retiring-", "/index/deprecating-", "/index/retirement-of-", "/index/deprecation-of-"];

const openAiChatGptFlagshipReleaseUrls = new Set([
  "https://openai.com/index/chatgpt",
  "https://openai.com/index/introducing-chatgpt-search",
  "https://openai.com/index/introducing-chatgpt-agent",
]);

const openAiChatGptTierLaunchUrls = new Set([
  "https://openai.com/index/chatgpt-plus",
  "https://openai.com/index/introducing-chatgpt-pro",
  "https://openai.com/index/introducing-chatgpt-team",
  "https://openai.com/index/introducing-chatgpt-enterprise",
  "https://openai.com/index/introducing-chatgpt-go",
  "https://openai.com/global-affairs/introducing-chatgpt-gov",
  "https://openai.com/index/introducing-chatgpt-edu",
]);

const openAiChatGptFeatureUrlHints = [
  "/index/chatgpt-for-",
  "/index/chatgpt-study-mode",
  "/index/group-chats-in-chatgpt",
  "/index/new-chatgpt-images-is-here",
  "/index/introducing-apps-in-chatgpt",
  "/index/chatgpt-shopping-research",
  "/index/chatgpt-whatsapp-transition",
  "/index/new-ways-to-learn-math-and-science-in-chatgpt",
  "/index/developers-can-now-submit-apps-to-chatgpt",
  "/index/buy-it-in-chatgpt",
  "/index/improvements-to-data-analysis-in-chatgpt",
  "/index/new-tools-for-chatgpt-enterprise",
];

const anthropicSourcePriority: Record<string, number> = {
  "anthropic-github-releases": 10,
  "anthropic-releases": 20,
  "anthropic-news": 30,
};

const anthropicDeveloperProducts = ["claude", "claude code"];
const anthropicNewsModelReleaseTitleRegex = /\bintroducing\s+claude\s+(opus|sonnet|haiku)\s+\d+(?:\.\d+)?\b/i;
const anthropicDirectModelLaunchTitleRegex =
  /\b(?:introducing|announcing|we(?:'|’)ve launched|launching)\s+claude(?:\s+(?:opus|sonnet|haiku))?\s+\d+(?:\.\d+)?(?:\s+(?:and|&)\s+claude(?:\s+(?:opus|sonnet|haiku))?\s+\d+(?:\.\d+)?)*\b/i;
const anthropicModelAvailabilityRegex =
  /\b(introducing|introduced|launch(?:ed)?|released?|available(?:\s+today)?|generally available|\bga\b)\b/i;
const anthropicReleaseNoteMilestoneRegex =
  /\b(1m token context|1 million token context|context window|128k output tokens?|context compaction|adaptive thinking|effort levels?|us-only inference|rate limits?)\b/i;

const explicitDeprecationTitleRegex =
  /\b(deprecation(?: announcement)?|deprecated|retired|retirement scheduled|scheduled for retirement|sunset|sunsetting|will be shut down|shut down|shutdown)\b/i;

const explicitDeprecationUrlRegex = /\/(?:deprecations?|model-deprecations)(?:\/|$|[#?])/i;

const googleSourcePriority: Record<string, number> = {
  "google-gemini-release-notes-rss": 10,
  "google-vertex-release-notes": 20,
  "google-cloud-ai-release-notes": 30,
  "google-ai-blog-rss": 40,
};

const googleAllowedProductRoots = new Set(["gemini", "veo", "imagen"]);

const googleBlogAllowedPathRegex = /\/(?:models-and-research|technology\/ai|developers-tools)\//i;
const googleBlogExcludedPathRegex =
  /\/(?:products\/gemini-app|products\/workspace|products\/chrome|devices|platforms\/android|company-news|products\/gemini\/)/i;

const googlePartnerModelRegex = /\b(anthropic|claude|llama|mistral|openai|grok|partner model)\b/i;
const googleModelLaunchRegex =
  /\b(released|release|launched|launch|introducing|available in preview|public preview|generally available|\bga\b|our latest|first .* model|most advanced|built for intelligence at scale)\b/i;
const googleRolloutRegex =
  /\b(available|availability|support|supports|supported|endpoint|tool|feature|extension|rollout|beta|preview|generally available|\bga\b|switched to|points to|integrated)\b/i;
const googleFeatureSpecificRegex =
  /\b(update|support|supports|supported|endpoint|tool|feature|extension|reference-to-video|native audio|computer use|video extension|switched to|points to|integrated|cli)\b/i;
const googleReleaseNoiseRegex =
  /\b(pricing|billing|rate limits?|token count|input token|output token|cost|lowering the cost|grounding with google search|copy tuned|upscaling|watermark|virtual try-on)\b/i;

type GoogleNormalizationMetadata = {
  category: EventCategory;
  dedupeKey?: string;
  sourcePriority: number;
  products: string[];
  models: string[];
};

type AnthropicNormalizationMetadata = {
  category: EventCategory;
  dedupeKey?: string;
  sourcePriority: number;
  products: string[];
  models: string[];
};

const inferOpenAiRssCategory = (item: ParsedSourceItem): EventCategory => {
  const categories = normalizeFeedCategories(item.feedCategories);
  const title = item.title.toLowerCase();
  const canonicalUrl = normalizeCanonicalUrl(item.canonicalUrl);
  const hasProductNewsCategory = categories.some((value) => value === "product" || value === "product news" || value === "release");
  const hasAllowedContextCategory =
    hasProductNewsCategory || categories.length === 0 || categories.includes("research");
  const isDirectRetirementAnnouncement =
    (openAiDirectRetirementTitleRegex.test(item.title) || openAiRetirementUrlHints.some((value) => canonicalUrl.includes(value))) &&
    openAiRetirementEntityRegex.test(item.title);

  if (openAiChatGptFlagshipReleaseUrls.has(canonicalUrl)) return "model_release";
  if (isDirectRetirementAnnouncement) return "deprecation";
  if (openAiChatGptTierLaunchUrls.has(canonicalUrl)) return "blog_update";
  if (openAiChatGptFeatureUrlHints.some((value) => canonicalUrl.includes(value))) return "blog_update";
  if (openAiNonReleaseTitleRegex.test(title)) return "blog_update";
  if (openAiModelReleaseTitleRegex.test(title) && hasAllowedContextCategory) return "model_release";
  return "blog_update";
};

const normalizeAnthropicVersion = (value: string) => value.replace(/-/g, ".");

const extractAnthropicModels = (item: ParsedSourceItem, text: string, mode: "primary" | "full" = "full") => {
  const segments = [item.title];
  if (mode === "full") {
    segments.push(text);
  }
  try {
    const url = new URL(item.canonicalUrl);
    segments.push(decodeURIComponent(url.pathname));
  } catch {
    segments.push(item.canonicalUrl);
  }

  const models: string[] = [];
  const explicitRegex = /\bclaude[-\s]+(opus|sonnet|haiku)[-\s]+(\d+(?:[.-]\d+)*(?:-\d+)*)\b/gi;
  const implicitRegex = /\b(opus|sonnet|haiku)[-\s]+(\d+(?:[.-]\d+)*(?:-\d+)*)\b/gi;

  for (const segment of segments) {
    let match: RegExpExecArray | null;
    while ((match = explicitRegex.exec(segment)) !== null) {
      models.push(`claude-${match[1].toLowerCase()}-${normalizeAnthropicVersion(match[2])}`);
    }
    while ((match = implicitRegex.exec(segment)) !== null) {
      models.push(`claude-${match[1].toLowerCase()}-${normalizeAnthropicVersion(match[2])}`);
    }
  }

  return dedupe(models, (value) => value).sort();
};

const anthropicReleaseNoteMilestoneKey = (text: string) => {
  if (/\b(1m token context|1 million token context|context window)\b/i.test(text)) return "1m-context";
  if (/\b128k output tokens?\b/i.test(text)) return "128k-output";
  if (/\bcontext compaction\b/i.test(text)) return "context-compaction";
  if (/\badaptive thinking\b/i.test(text)) return "adaptive-thinking";
  if (/\beffort levels?\b/i.test(text)) return "effort";
  if (/\bus-only inference\b/i.test(text)) return "us-only-inference";
  return null;
};

const inferAnthropicMetadata = (
  source: SourceRow,
  item: ParsedSourceItem,
  text: string
): AnthropicNormalizationMetadata | null => {
  const primaryModels = extractAnthropicModels(item, text, "primary");
  const models = source.id === "anthropic-github-releases" ? extractAnthropicModels(item, text, "full") : primaryModels;
  const products = dedupe(
    anthropicDeveloperProducts.filter((value) => text.toLowerCase().includes(value.toLowerCase())).concat(["claude"]),
    (value) => value
  );
  const priority = anthropicSourcePriority[source.id] ?? 0;

  if (source.id === "anthropic-github-releases") {
    return {
      category: "release_note",
      sourcePriority: priority,
      products,
      models,
    };
  }

  if (source.id === "anthropic-news") {
    if (!primaryModels.length || !anthropicNewsModelReleaseTitleRegex.test(item.title)) {
      return null;
    }
    return {
      category: "model_release",
      dedupeKey: `${primaryModels.join("|")}|release`,
      sourcePriority: priority,
      products,
      models,
    };
  }

  if (source.id === "anthropic-releases") {
    const milestoneKey = anthropicReleaseNoteMilestoneKey(text);
    const isDirectModelLaunch =
      primaryModels.length > 0 &&
      anthropicDirectModelLaunchTitleRegex.test(item.title) &&
      anthropicModelAvailabilityRegex.test(text);
    if (isDirectModelLaunch && !milestoneKey) {
      return {
        category: "model_release",
        dedupeKey: `${primaryModels.join("|")}|release`,
        sourcePriority: priority,
        products,
        models,
      };
    }
    return {
      category: "release_note",
      dedupeKey: milestoneKey && models.length ? `${models.join("|")}|${milestoneKey}` : undefined,
      sourcePriority: priority,
      products,
      models,
    };
  }

  return null;
};

const normalizeGoogleEntityToken = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9.\s/-]+/g, " ")
    .replace(/[\/_]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "")
    .replace(/-(\d+)-(\d+)(?=-|$)/g, "-$1.$2")
    .replace(/-preview(?:-\d{2}-\d{4})?(?=-|$)/g, "")
    .replace(/-exp(?=-|$)/g, "")
    .replace(/-latest(?=-|$)/g, "")
    .replace(/-001(?=-|$)/g, "")
    .replace(/-generate(?=-|$)/g, "")
    .replace(/-(?:public|general(?:ly)?|available|ga)(?=-|$)/g, "")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");

const isInterestingGoogleEntity = (value: string) => {
  const base = value.split("-", 1)[0];
  if (!googleAllowedProductRoots.has(base)) return false;
  return /\d/.test(value) || /(embedding|flash|pro|image|live|tts|computer-use|fast|ultra|deep-think|deep-research)/.test(value);
};

const extractGoogleEntityKeys = (item: ParsedSourceItem, text: string) => {
  const segments = [item.title, text];
  try {
    const url = new URL(item.canonicalUrl);
    const pathSegments = decodeURIComponent(url.pathname)
      .split("/")
      .map((value) => value.trim())
      .filter(Boolean);
    segments.push(...pathSegments);
    for (let index = 0; index < pathSegments.length - 1; index += 1) {
      segments.push(`${pathSegments[index]} ${pathSegments[index + 1]}`);
    }
  } catch {
    segments.push(item.canonicalUrl);
  }
  const matches: string[] = [];
  const tokenRegex =
    /\b(?:gemini|veo|imagen)(?:[-\s](?:\d+(?:\.\d+)?|flash(?:-lite)?|pro|ultra|nano|mini|lite|live|image(?:-preview)?|images|embedding(?:s)?|tts|preview|exp|latest|stable|fast|audio|video|computer-use|thinking|thinking-lite|deep-think|deep-research|customtools)){0,6}\b/gi;
  for (const segment of segments) {
    const normalizedSegment = segment.replace(/[()]/g, " ").replace(/\//g, " ");
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(normalizedSegment)) !== null) {
      const normalized = normalizeGoogleEntityToken(match[0]);
      if (normalized && isInterestingGoogleEntity(normalized)) {
        matches.push(normalized);
      }
    }
  }
  return dedupe(matches, (value) => value);
};

const normalizeGoogleTitle = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const titleMentionsEntity = (title: string, entity: string) => {
  const normalizedTitle = normalizeGoogleTitle(title);
  const normalizedEntity = entity.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  return normalizedTitle.includes(normalizedEntity);
};

const googleDedupeStage = (text: string, category: EventCategory) => {
  if (category === "deprecation") return "deprecation";
  void text;
  return "release";
};

const inferGoogleMetadata = (source: SourceRow, item: ParsedSourceItem, text: string): GoogleNormalizationMetadata | null => {
  const canonicalUrl = normalizeCanonicalUrl(item.canonicalUrl);
  const entities = extractGoogleEntityKeys(item, text).filter((value) => googleAllowedProductRoots.has(value.split("-", 1)[0]));
  const products = dedupe(entities.map((value) => value.split("-", 1)[0]), (value) => value);
  const models = dedupe(entities, (value) => value);
  const priority = googleSourcePriority[source.id] ?? 0;
  const lowerText = text.toLowerCase();

  if (source.id === "google-gemini-release-notes-rss") {
    return {
      category: "release_note",
      sourcePriority: priority,
      products: products.length ? products : ["gemini"],
      models,
    };
  }

  if (!models.length || (googlePartnerModelRegex.test(text) && !products.length)) {
    return null;
  }

  if (source.id === "google-ai-blog-rss") {
    if (!googleBlogAllowedPathRegex.test(canonicalUrl) || googleBlogExcludedPathRegex.test(canonicalUrl)) {
      return null;
    }
    const category = /\/developers-tools\//i.test(canonicalUrl) ? "tech_guide" : "model_release";
    return {
      category,
      dedupeKey:
        category === "model_release" ? `${models[0]}|${googleDedupeStage(text, category)}` : undefined,
      sourcePriority: priority,
      products,
      models,
    };
  }

  if (googlePartnerModelRegex.test(text) && !products.some((value) => googleAllowedProductRoots.has(value))) {
    return null;
  }

  if (item.sourceLabel?.toLowerCase() === "deprecated" || /\b(deprecat|shut down|removed on|will be shut down)\b/i.test(text)) {
    return {
      category: "deprecation",
      dedupeKey: `${models[0]}|${googleDedupeStage(text, "deprecation")}`,
      sourcePriority: priority,
      products,
      models,
    };
  }

  const primaryEntity = models[0];
  const launchLike =
    (googleModelLaunchRegex.test(text) || /\/models\//i.test(canonicalUrl) || (source.id === "google-ai-blog-rss" && titleMentionsEntity(item.title, primaryEntity))) &&
    !googleFeatureSpecificRegex.test(item.title) &&
    !googleReleaseNoiseRegex.test(text);
  if (launchLike) {
    return {
      category: "model_release",
      dedupeKey: `${primaryEntity}|${googleDedupeStage(text, "model_release")}`,
      sourcePriority: priority,
      products,
      models,
    };
  }

  if (googleRolloutRegex.test(lowerText) || item.sourceLabel?.toLowerCase() === "announcement") {
    return {
      category: "model_rollout",
      sourcePriority: priority,
      products,
      models,
    };
  }

  return {
    category: "release_note",
    sourcePriority: priority,
    products,
    models,
  };
};

const inferCategory = (source: SourceRow, item: ParsedSourceItem, text: string, base: EventCategory): EventCategory => {
  if (source.id === "openai-blog-rss") {
    return inferOpenAiRssCategory(item);
  }
  const lower = text.toLowerCase();
  if (lower.includes("deprecat")) return "deprecation";
  if (lower.includes("rollout") || lower.includes("roll out") || lower.includes("launch") || lower.includes("available")) return "model_rollout";
  if (lower.includes("release notes") || lower.includes("changelog") || source.default_category === "release_note") return "release_note";
  if (lower.includes("guide") || lower.includes("documentation") || lower.includes("docs")) return "tech_guide";
  if (lower.includes("model") && (lower.includes("release") || lower.includes("introduce") || lower.includes("announc"))) return "model_release";
  return base;
};

const isExplicitDeprecation = (source: SourceRow, item: ParsedSourceItem) => {
  if (source.id === "openai-blog-rss") return false;
  const normalizedUrl = normalizeCanonicalUrl(item.canonicalUrl);
  if (item.sourceLabel?.trim().toLowerCase() === "deprecated") return true;
  if (explicitDeprecationTitleRegex.test(item.title)) return true;
  return explicitDeprecationUrlRegex.test(normalizedUrl);
};

const extractTerms = (text: string, vocabulary: string[]) =>
  vocabulary.filter((value) => text.toLowerCase().includes(value.toLowerCase()));

export const normalizeSourceItems = (source: SourceRow, items: ParsedSourceItem[]) => {
  const normalized = [];
  const vendorProducts = extractTerms(`${source.vendor} ${source.name}`, knownProducts);
  for (const item of items) {
    const combined = `${item.title}\n${item.summary}`.trim();
    const googleMetadata = source.vendor === "google" ? inferGoogleMetadata(source, item, combined) : null;
    const anthropicMetadata = source.vendor === "anthropic" ? inferAnthropicMetadata(source, item, combined) : null;
    const vendorMetadata = googleMetadata ?? anthropicMetadata;
    if ((source.vendor === "google" || source.vendor === "anthropic") && !vendorMetadata) continue;
    const candidates = dedupe(extractDateCandidates(`${combined} ${item.externalId}`), (candidate) => `${candidate.date}-${candidate.kind}`);
    const dateRefs = candidates.length
      ? candidates.map((c) => c.date).filter((value, index, arr) => arr.indexOf(value) === index)
      : item.publishedAt
      ? [item.publishedAt]
      : [];
    const baseCategory = vendorMetadata?.category ?? inferCategory(source, item, combined, source.default_category);
    const category = isExplicitDeprecation(source, item) ? "deprecation" : baseCategory;
    const extractedProducts =
      source.vendor === "anthropic"
        ? extractTerms(combined, anthropicDeveloperProducts)
        : extractTerms(combined, knownProducts.concat(vendorProducts));
    const extractedModels = source.vendor === "anthropic" ? [] : extractTerms(combined, knownModels);
    const productHints = dedupe(
      extractedProducts.concat(vendorMetadata?.products ?? []),
      (v) => v
    ).sort();
    const modelHints = dedupe(extractedModels.concat(vendorMetadata?.models ?? []), (v) => v).sort();
    const tags = dedupe(
      [category, source.vendor, source.name]
        .concat(item.feedCategories ?? [])
        .concat(item.sourceLabel ? [item.sourceLabel] : [])
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
      const dedupeDate = normalizedDate.iso.slice(0, 10);
      const id = createHash("sha1")
        .update(
          vendorMetadata?.dedupeKey
            ? `${source.vendor}|${category}|${dedupeDate}|${vendorMetadata.dedupeKey}`
            : `${canonicalUrl}|${source.vendor}|${category}|${normalizedDate.iso}|${anchorBase}`
        )
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
        dedupeKey: vendorMetadata?.dedupeKey,
        sourcePriority: vendorMetadata?.sourcePriority,
      });
    }
  }
  return normalized;
};
