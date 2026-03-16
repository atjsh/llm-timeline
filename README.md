# llm-timeline

Read-only TypeScript service that ingests curated official AI release sources and serves:

- a JSON API
- a filterable iCalendar/ICS feed

The stack is Node.js, Hono, and SQLite.

## Endpoints

- `GET /healthz`
- `GET /sources`
- `GET /events`
- `GET /events/:id`
- `GET /calendar.ics`

Example filters:

- `/events?vendor=openai&limit=20`
- `/calendar.ics?vendor=anthropic`
- `/calendar.ics?vendor=google&category=release_note`

## Local development

Requirements:

- Node.js 24+
- npm

Install and run:

```bash
npm install
npm run build
npm start
```

The default listen address is `0.0.0.0:3000`.

Useful environment variables:

- `HOST`
- `PORT`
- `DATABASE_PATH`
- `API_BASE_URL`
- `BACKFILL_SINCE`
- `MAX_FETCH_CONCURRENCY`
- `REQUEST_TIMEOUT_MS`

## Ingestion

Run incremental refresh:

```bash
npm run cli:refresh
```

Run a vendor-scoped refresh:

```bash
npm run cli:refresh -- --vendor=anthropic
```

Run backfill:

```bash
npm run cli:backfill -- --since=2020-01-01
```

Rebuild derived events for a stored source after classifier changes:

```bash
npm run cli:rebuild -- --source=openai-blog-rss
```

## Tests

```bash
npm test
```

## systemd deployment

This repo includes a generic systemd unit template and installer:

```bash
npm run install:systemd
```

The installer writes:

- `/etc/systemd/system/llm-timeline.service`
- `/etc/llm-timeline/llm-timeline.env`

The installed unit runs the service from the current checkout and records the active `node` and `npm` binary paths so `nvm`-managed Node installs work under systemd.

## Notes

- SQLite databases, build output, and dependencies are intentionally gitignored.
- Source manifests may require periodic maintenance as upstream vendors change feed URLs or access policies.
