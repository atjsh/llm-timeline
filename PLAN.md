# Hono AI Release Timeline Service

## Summary
- Build a greenfield TypeScript + Hono Node service with no frontend.
- Serve two read-only outputs from the same normalized store: a public JSON API and a filterable iCal/ICS feed.
- Ingest only curated official sources for `openai`, `anthropic`, and `google` (including Google AI-adjacent surfaces), with initial backfill from `2020-01-01` onward.
- Publish only tracked AI-relevant categories: `model_release`, `model_rollout`, `deprecation`, `release_note`, `tech_guide`, and `blog_update`.
- Run ingestion manually via CLI in v1; no scheduler and no admin HTTP refresh endpoint.

## Key Changes
- Use `npm` + TypeScript on Node 24+, Hono in Node mode, and SQLite stored on a persistent volume.
- Split the app into five modules: HTTP API, source registry/fetchers, normalization pipeline, SQLite persistence, and ICS rendering.
- Check in a static source manifest that enumerates exact official sources and parser strategy for each entry. Prefer RSS/Atom first, then GitHub release/announcement feeds, then docs/changelog HTML pages with stable dates and archive pagination.
- Seed the manifest with:
  - OpenAI blog/news, platform changelog/release-note pages, model/deprecation pages, and relevant official GitHub release feeds.
  - Anthropic blog/news, docs release notes/changelog, model/deprecation pages, and relevant official GitHub release feeds.
  - Google AI Blog, Gemini API and AI Studio release-note/docs pages, Vertex AI release notes, Google Cloud AI/ML release-note or blog surfaces relevant to AI products, and relevant official Google AI SDK GitHub release feeds.
- Fetch with conditional requests (`ETag`, `Last-Modified`), low concurrency, retry/backoff, and per-source cooldowns. Do not use headless browsing or broad site crawling.
- Persist `sources`, `fetch_runs`, `raw_items`, and `events`.
- Normalize each qualifying item into one or more events with fixed fields: `id`, `vendor`, `category`, `title`, `summary`, `canonical_url`, `evidence_url`, `evidence_excerpt`, `published_at`, `event_date`, `event_date_kind`, `date_precision`, `products[]`, `models[]`, `tags[]`, and `last_seen_at`.
- If one source contains multiple distinct dated milestones, split them into separate events. Prefer explicit effective/rollout/deprecation dates; otherwise fall back to publication date.
- Deduplicate on canonical source + category + event date + normalized milestone anchor/title so refetches update existing events instead of creating new ones.

## Public Interfaces
- `GET /healthz` returns app and database status.
- `GET /sources` returns the checked-in source registry plus last fetch metadata.
- `GET /events` returns reverse-chronological JSON with repeatable filters: `vendor`, `category`, `product`, `model`, `since`, `until`, `limit`, and stable cursor pagination.
- `GET /events/:id` returns one normalized event including evidence metadata.
- `GET /calendar.ics` returns an ICS feed using the same filters; each filter URL is a stable subscription URL for calendar clients.
- ICS items use one event per normalized record, stable `UID`s, `SUMMARY`, `DESCRIPTION`, `URL`, and `CATEGORIES`. Emit all-day entries when only a date is known, and UTC timestamp entries when an exact time is present.
- Provide CLI commands for `refresh` (incremental crawl) and `backfill --since=2020-01-01`.

## Test Plan
- Parser fixture tests for RSS/Atom, GitHub feeds, and HTML changelog pages across all vendors.
- Classification and date extraction tests for all six categories, including effective-vs-published date precedence and multi-milestone posts.
- Deduplication/update tests for refetched items, edited titles, and multiple upstream pages resolving to the same canonical event.
- API tests for filter combinations, cursor pagination, empty-result cases, and the `2020-01-01` backfill cutoff.
- ICS tests for RFC5545 validity, stable UIDs, all-day vs timestamp behavior, and filter-specific subscription URLs.

## Assumptions
- The repo is greenfield and will use `npm`, not `pnpm`.
- "Serverless-compatible" is interpreted as "no in-process scheduler"; deployment is still a normal Node runtime with durable SQLite storage.
- v1 is English-only, read-only, and has no frontend, auth system, or operator UI.
- Only curated official sources are ingested, and only tracked AI-relevant categories are published.
