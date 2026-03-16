export const ALLOWED_VENDORS = ["openai", "anthropic", "google"] as const;
export const ALLOWED_CATEGORIES = [
  "model_release",
  "model_rollout",
  "deprecation",
  "release_note",
  "tech_guide",
  "blog_update",
] as const;

export type Vendor = (typeof ALLOWED_VENDORS)[number];
export type EventCategory = (typeof ALLOWED_CATEGORIES)[number];
export type EventDateKind = "published" | "effective" | "rollout" | "deprecation" | "release";
export type DatePrecision = "date" | "datetime";

export interface SourceManifestEntry {
  id: string;
  vendor: Vendor;
  name: string;
  url: string;
  parser:
    | "rss_atom"
    | "github_releases"
    | "changelog_html"
    | "docs_html";
  enabled?: boolean;
  defaultCategory?: EventCategory;
  cooldownSeconds?: number;
  description?: string;
}

export interface SourceRow {
  id: string;
  vendor: Vendor;
  name: string;
  url: string;
  parser: SourceManifestEntry["parser"];
  enabled: boolean;
  default_category: EventCategory;
  cooldown_seconds: number;
  etag?: string | null;
  last_modified?: string | null;
  last_fetched_at?: string | null;
  last_success_at?: string | null;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceMetadata {
  source: SourceRow;
  last_fetch_run?: FetchRun | null;
}

export interface RawItem {
  id?: number;
  source_id: string;
  external_id: string;
  title: string;
  canonical_url: string;
  summary: string;
  published_at?: string | null;
  fetched_at: string;
  payload_json: string;
  checksum: string;
}

export interface ParsedSourceItem {
  externalId: string;
  title: string;
  canonicalUrl: string;
  summary: string;
  publishedAt?: string;
  eventDateHints?: string[];
  feedCategories?: string[];
}

export interface RawParsedEvent {
  id: string;
  vendor: Vendor;
  category: EventCategory;
  title: string;
  summary: string;
  canonicalUrl: string;
  evidenceUrl: string;
  evidenceExcerpt: string;
  publishedAt?: string;
  eventDate: string;
  eventDateKind: EventDateKind;
  datePrecision: DatePrecision;
  products: string[];
  models: string[];
  tags: string[];
  anchor: string;
  rawItemId?: number;
}

export interface EventRow {
  id: string;
  vendor: Vendor;
  category: EventCategory;
  title: string;
  summary: string;
  canonical_url: string;
  evidence_url: string;
  evidence_excerpt: string;
  published_at?: string | null;
  event_date: string;
  event_date_kind: EventDateKind;
  date_precision: DatePrecision;
  products: string[];
  models: string[];
  tags: string[];
  source_id: string;
  raw_item_id?: number | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface FetchRun {
  id: number;
  source_id?: string;
  started_at: string | undefined;
  finished_at?: string;
  status: "running" | "success" | "error";
  fetched_count?: number;
  inserted_count?: number;
  updated_count?: number;
  error?: string | null;
}
