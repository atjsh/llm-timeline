import { ALLOWED_CATEGORIES, ALLOWED_VENDORS, type EventRow } from "../types.js";

export interface FeedsPageState {
  vendor: string;
  category: string;
  product: string;
  model: string;
  since: string;
  until: string;
  limit: number;
  cursor: string;
}

export interface FeedsPageInput {
  events: EventRow[];
  hasMore: boolean;
  nextCursor: string | null;
  state: FeedsPageState;
  eventsJsonHref: string;
  calendarHref: string;
  sourcesHref: string;
  itemsHref: string;
}

const pageTitle = "LLM Feeds";

const vendorLabels: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const humanizeToken = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());

const compactText = (value: string, limit = 240) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 3).trimEnd()}...`;
};

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

const stripHtml = (value: string) =>
  decodeHtmlEntities(decodeHtmlEntities(value)).replace(/<[^>]*>?/g, " ");

const renderSummaryText = (event: EventRow) => {
  const rawSummary = event.evidence_excerpt || event.summary || "";
  return compactText(stripHtml(rawSummary));
};

const safeHref = (value: string) => {
  if (value.startsWith("/")) return escapeHtml(value);
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return escapeHtml(url.toString());
    }
  } catch {
    // Fall through to the safe fallback.
  }
  return "#";
};

const formatEventDate = (event: EventRow) => {
  const parsed = Date.parse(event.event_date);
  if (Number.isNaN(parsed)) return escapeHtml(event.event_date);
  return escapeHtml(dateFormatter.format(new Date(parsed)));
};

const formatEventDateKind = (value: EventRow["event_date_kind"]) =>
  value === "published" ? "Published" : humanizeToken(value);

const renderSelectOptions = (
  options: Array<{ value: string; label: string }>,
  selectedValue: string
) =>
  options
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}"${option.value === selectedValue ? " selected" : ""}>${escapeHtml(option.label)}</option>`
    )
    .join("");

const buildPageHref = (state: FeedsPageState, overrides: Partial<FeedsPageState> = {}) => {
  const next = { ...state, ...overrides };
  const params = new URLSearchParams();
  params.set("vendor", next.vendor || "all");
  params.set("category", next.category || "all");
  if (next.product) params.set("product", next.product);
  if (next.model) params.set("model", next.model);
  if (next.since) params.set("since", next.since);
  if (next.until) params.set("until", next.until);
  params.set("limit", String(next.limit));
  if (next.cursor) params.set("cursor", next.cursor);
  return `/feeds?${params.toString()}`;
};

const activeFilterChips = (state: FeedsPageState) => {
  const chips: Array<{ label: string; value: string }> = [];
  if (state.vendor !== "all") chips.push({ label: "Vendor", value: vendorLabels[state.vendor] ?? humanizeToken(state.vendor) });
  if (state.category === "all") {
    chips.push({ label: "Category", value: "All" });
  } else if (state.category) {
    chips.push({ label: "Category", value: humanizeToken(state.category) });
  }
  if (state.product) chips.push({ label: "Product", value: state.product });
  if (state.model) chips.push({ label: "Model", value: state.model });
  if (state.since) chips.push({ label: "Since", value: state.since });
  if (state.until) chips.push({ label: "Until", value: state.until });
  chips.push({ label: "Per page", value: String(state.limit) });
  return chips;
};

const renderTimelineItem = (event: EventRow) => {
  const summary = renderSummaryText(event);
  const vendorLabel = vendorLabels[event.vendor] ?? humanizeToken(event.vendor);
  const categoryLabel = humanizeToken(event.category);
  const sourceHref = safeHref(event.canonical_url);
  const jsonHref = safeHref(`/events/${encodeURIComponent(event.id)}`);
  const models = event.models.slice(0, 3);
  const products = event.products.slice(0, 3);

  return `
    <li class="timeline__item">
      <div class="timeline__date">
        <div class="timeline__day">${formatEventDate(event)}</div>
        <div class="timeline__kind">${escapeHtml(formatEventDateKind(event.event_date_kind))}</div>
      </div>
      <article class="event-card">
        <div class="event-card__badges">
          <span class="badge badge--vendor badge--${escapeHtml(event.vendor)}">${escapeHtml(vendorLabel)}</span>
          <span class="badge badge--category">${escapeHtml(categoryLabel)}</span>
        </div>
        <h2 class="event-card__title">${escapeHtml(event.title || "(untitled)")}</h2>
        <p class="event-card__summary">${escapeHtml(summary || "No summary available.")}</p>
        ${
          products.length || models.length
            ? `<p class="event-card__meta">${
                products.length ? `Products: ${escapeHtml(products.join(", "))}` : ""
              }${products.length && models.length ? " · " : ""}${models.length ? `Models: ${escapeHtml(models.join(", "))}` : ""}</p>`
            : ""
        }
        <div class="event-card__links">
          <a href="${sourceHref}" target="_blank" rel="noreferrer">Source</a>
          <a href="${jsonHref}" target="_blank" rel="noreferrer">JSON</a>
        </div>
      </article>
    </li>
  `;
};

export const renderTimelineItems = (events: EventRow[]) => events.map((event) => renderTimelineItem(event)).join("");

const renderSummaryHeading = (count: number, hasMore: boolean) =>
  `Showing ${count} event${count === 1 ? "" : "s"}${hasMore ? " with older pages available" : ""}.`;

const renderNoscriptPagination = (olderHref: string | null, newestHref: string | null) => {
  if (!olderHref && !newestHref) return "";
  return `
        <noscript>
          <nav class="pagination pagination--fallback">
            ${newestHref ? `<a href="${safeHref(newestHref)}">Newest</a>` : ""}
            ${olderHref ? `<a href="${safeHref(olderHref)}">Older</a>` : ""}
          </nav>
        </noscript>
  `;
};

const renderLoaderSection = (input: FeedsPageInput) => {
  if (!input.hasMore || !input.nextCursor) return "";
  return `
        <div
          class="feed-loader"
          data-feeds-loader
          data-fragment-base="${safeHref(input.itemsHref)}"
          data-next-cursor="${escapeHtml(input.nextCursor)}"
          data-has-more="${input.hasMore ? "true" : "false"}"
          data-loaded-count="${input.events.length}"
        >
          <div class="feed-loader__controls">
            <button type="button" class="feed-loader__button" data-load-more>Load more</button>
            <p class="feed-loader__status" data-loader-status aria-live="polite">Scroll for older events or tap Load more.</p>
          </div>
          <div class="feed-loader__sentinel" data-loader-sentinel aria-hidden="true"></div>
        </div>
  `;
};

const inlineScript = `
(() => {
  const timeline = document.querySelector("[data-timeline]");
  const loader = document.querySelector("[data-feeds-loader]");
  const summary = document.querySelector("[data-summary-heading]");
  if (!(timeline instanceof HTMLElement) || !(summary instanceof HTMLElement) || !(loader instanceof HTMLElement)) {
    return;
  }

  const button = loader.querySelector("[data-load-more]");
  const status = loader.querySelector("[data-loader-status]");
  const sentinel = loader.querySelector("[data-loader-sentinel]");
  if (!(button instanceof HTMLButtonElement) || !(status instanceof HTMLElement) || !(sentinel instanceof HTMLElement)) {
    return;
  }

  let nextCursor = loader.dataset.nextCursor || "";
  let hasMore = loader.dataset.hasMore === "true";
  let loading = false;
  let loadedCount = Number(loader.dataset.loadedCount || timeline.children.length || 0);
  let observer = null;

  const summaryText = (count, more) => {
    return "Showing " + count + " event" + (count === 1 ? "" : "s") + (more ? " with older pages available." : ".");
  };

  const setStatus = (message) => {
    status.textContent = message;
  };

  const updateControls = () => {
    summary.textContent = summaryText(loadedCount, hasMore);
    button.disabled = loading || !hasMore;
    button.hidden = !hasMore;
    sentinel.hidden = !hasMore;
    loader.dataset.nextCursor = nextCursor;
    loader.dataset.hasMore = String(hasMore);
    loader.dataset.loadedCount = String(loadedCount);
    if (!hasMore && !loading) {
      setStatus("You’ve reached the end of the timeline.");
      if (observer) {
        observer.disconnect();
      }
    }
  };

  const loadMore = async (trigger) => {
    if (loading || !hasMore || !nextCursor) {
      return;
    }
    loading = true;
    updateControls();
    setStatus(trigger === "manual" ? "Loading more events…" : "Loading older events…");

    try {
      const url = new URL(loader.dataset.fragmentBase || "", window.location.href);
      url.searchParams.set("cursor", nextCursor);
      const response = await fetch(url.toString(), {
        headers: {
          "Accept": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error("request failed");
      }
      const payload = await response.json();
      if (typeof payload.html !== "string" || typeof payload.has_more !== "boolean") {
        throw new Error("invalid payload");
      }
      if (payload.html.trim()) {
        timeline.insertAdjacentHTML("beforeend", payload.html);
      }
      loadedCount += Number(payload.returned_count || 0);
      nextCursor = typeof payload.next_cursor === "string" ? payload.next_cursor : "";
      hasMore = Boolean(payload.has_more && nextCursor);
      setStatus(hasMore ? "Loaded more events." : "You’ve reached the end of the timeline.");
    } catch {
      setStatus("Couldn’t load older events. Tap Load more to retry.");
    } finally {
      loading = false;
      updateControls();
    }
  };

  button.addEventListener("click", () => {
    void loadMore("manual");
  });

  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMore("auto");
      }
    }, {
      rootMargin: "480px 0px",
    });
    observer.observe(sentinel);
  } else {
    setStatus("Tap Load more to continue browsing older events.");
  }

  updateControls();
})();
`;

const styles = `
  :root {
    color-scheme: light;
    --bg: #f3efe6;
    --panel: #fffdf8;
    --ink: #1f1a16;
    --muted: #6f675f;
    --line: #d6cdbf;
    --accent: #9d5b3b;
    --openai: #0f766e;
    --anthropic: #9a3412;
    --google: #1d4ed8;
    --shadow: 0 18px 48px rgba(41, 29, 20, 0.08);
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: "Georgia", "Times New Roman", serif;
    background:
      radial-gradient(circle at top left, rgba(157, 91, 59, 0.14), transparent 30%),
      linear-gradient(180deg, #f7f3ea 0%, var(--bg) 100%);
    color: var(--ink);
  }

  a {
    color: inherit;
  }

  .page {
    max-width: 1040px;
    margin: 0 auto;
    padding: 24px 16px 56px;
  }

  .hero {
    background: rgba(255, 253, 248, 0.88);
    border: 1px solid rgba(214, 205, 191, 0.9);
    border-radius: 24px;
    padding: 24px;
    box-shadow: var(--shadow);
    backdrop-filter: blur(12px);
  }

  .hero__eyebrow {
    margin: 0 0 8px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font: 600 0.75rem/1.2 "Helvetica Neue", Arial, sans-serif;
    color: var(--accent);
  }

  .hero h1 {
    margin: 0;
    font-size: clamp(2rem, 4vw, 3.6rem);
    line-height: 0.95;
  }

  .hero p {
    margin: 14px 0 0;
    max-width: 52rem;
    color: var(--muted);
    font-size: 1rem;
    line-height: 1.6;
  }

  .hero__links {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 20px;
  }

  .hero__links a,
  .controls__actions a,
  .controls__actions button,
  .pagination a,
  .feed-loader__button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    border-radius: 999px;
    padding: 0 16px;
    font: 600 0.94rem/1 "Helvetica Neue", Arial, sans-serif;
    text-decoration: none;
    transition: transform 120ms ease, background-color 120ms ease;
  }

  .hero__links a,
  .pagination a,
  .feed-loader__button {
    background: rgba(157, 91, 59, 0.12);
    border: 1px solid rgba(157, 91, 59, 0.24);
  }

  .hero__links a:hover,
  .controls__actions a:hover,
  .controls__actions button:hover,
  .pagination a:hover,
  .feed-loader__button:hover {
    transform: translateY(-1px);
  }

  .controls,
  .summary,
  .timeline-shell {
    margin-top: 20px;
    background: rgba(255, 253, 248, 0.9);
    border: 1px solid rgba(214, 205, 191, 0.9);
    border-radius: 24px;
    box-shadow: var(--shadow);
  }

  .controls {
    padding: 20px;
  }

  .controls__grid {
    display: grid;
    gap: 14px;
  }

  .controls label {
    display: grid;
    gap: 8px;
    font: 600 0.84rem/1.2 "Helvetica Neue", Arial, sans-serif;
    color: var(--muted);
    letter-spacing: 0.01em;
  }

  .controls input,
  .controls select {
    width: 100%;
    min-height: 44px;
    border-radius: 14px;
    border: 1px solid var(--line);
    background: #fff;
    padding: 0 14px;
    color: var(--ink);
    font: 500 0.98rem/1.2 "Helvetica Neue", Arial, sans-serif;
  }

  .controls__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 16px;
  }

  .controls__actions button {
    border: 0;
    background: var(--ink);
    color: #fff;
    cursor: pointer;
  }

  .controls__actions a {
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.92);
  }

  .summary {
    padding: 18px 20px;
  }

  .summary__heading {
    margin: 0 0 10px;
    font: 700 1rem/1.4 "Helvetica Neue", Arial, sans-serif;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip {
    display: inline-flex;
    gap: 6px;
    border-radius: 999px;
    padding: 7px 12px;
    background: rgba(31, 26, 22, 0.06);
    color: var(--ink);
    font: 500 0.84rem/1 "Helvetica Neue", Arial, sans-serif;
  }

  .chip strong {
    color: var(--muted);
    font-weight: 700;
  }

  .timeline-shell {
    padding: 8px 20px 20px;
  }

  .timeline {
    list-style: none;
    margin: 0;
    padding: 8px 0 0;
    position: relative;
  }

  .timeline::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 20px;
    width: 2px;
    background: linear-gradient(180deg, rgba(157, 91, 59, 0.25), rgba(157, 91, 59, 0.05));
  }

  .timeline__item {
    position: relative;
    display: grid;
    gap: 12px;
    padding: 12px 0 18px 42px;
  }

  .timeline__item::before {
    content: "";
    position: absolute;
    left: 12px;
    top: 20px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--panel);
    border: 4px solid var(--accent);
    box-shadow: 0 0 0 3px rgba(157, 91, 59, 0.14);
  }

  .timeline__date {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .timeline__day {
    font: 700 0.96rem/1.2 "Helvetica Neue", Arial, sans-serif;
  }

  .timeline__kind {
    color: var(--muted);
    font: 500 0.78rem/1.2 "Helvetica Neue", Arial, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .event-card {
    background: rgba(255, 255, 255, 0.88);
    border: 1px solid rgba(214, 205, 191, 0.95);
    border-radius: 20px;
    padding: 18px;
    min-width: 0;
  }

  .event-card__badges,
  .event-card__links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    border-radius: 999px;
    padding: 0 10px;
    font: 700 0.76rem/1 "Helvetica Neue", Arial, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .badge--vendor {
    color: #fff;
  }

  .badge--openai {
    background: var(--openai);
  }

  .badge--anthropic {
    background: var(--anthropic);
  }

  .badge--google {
    background: var(--google);
  }

  .badge--category {
    background: rgba(31, 26, 22, 0.08);
    color: var(--ink);
  }

  .event-card__title {
    margin: 12px 0 10px;
    font-size: clamp(1.12rem, 2vw, 1.42rem);
    line-height: 1.2;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .event-card__summary,
  .event-card__meta,
  .feed-loader__status {
    margin: 0;
    color: var(--muted);
    line-height: 1.6;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .event-card__meta {
    margin-top: 10px;
    font: 500 0.9rem/1.5 "Helvetica Neue", Arial, sans-serif;
  }

  .event-card__links {
    margin-top: 14px;
    font: 700 0.84rem/1 "Helvetica Neue", Arial, sans-serif;
  }

  .event-card__links a {
    text-decoration: underline;
    text-underline-offset: 0.18em;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .empty-state {
    margin: 0;
    padding: 28px 8px 16px;
    color: var(--muted);
    font-size: 1rem;
    line-height: 1.7;
  }

  .feed-loader,
  .pagination {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding-top: 18px;
  }

  .feed-loader {
    flex-direction: column;
    align-items: flex-start;
  }

  .feed-loader__controls {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }

  .feed-loader__button {
    cursor: pointer;
    color: var(--ink);
  }

  .feed-loader__button[disabled] {
    opacity: 0.6;
    cursor: progress;
    transform: none;
  }

  .feed-loader__sentinel {
    width: 100%;
    height: 1px;
  }

  .pagination--fallback {
    padding-top: 8px;
  }

  @media (min-width: 720px) {
    .page {
      padding: 36px 24px 72px;
    }

    .controls__grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .timeline::before {
      left: 130px;
    }

    .timeline__item {
      grid-template-columns: 100px minmax(0, 1fr);
      gap: 24px;
      padding: 12px 0 22px;
    }

    .timeline__item::before {
      left: 121px;
    }

    .timeline__date {
      padding-top: 8px;
      text-align: right;
    }
  }
`;

export const renderFeedsPage = (input: FeedsPageInput) => {
  const state = input.state;
  const vendorOptions = [
    { value: "all", label: "All vendors" },
    ...ALLOWED_VENDORS.map((vendor) => ({
      value: vendor,
      label: vendorLabels[vendor] ?? humanizeToken(vendor),
    })),
  ];
  const categoryOptions = [
    { value: "all", label: "All categories" },
    ...ALLOWED_CATEGORIES.map((category) => ({
      value: category,
      label: humanizeToken(category),
    })),
  ];
  const chips = activeFilterChips(state);
  const olderHref = input.nextCursor ? buildPageHref(state, { cursor: input.nextCursor }) : null;
  const newestHref = state.cursor ? buildPageHref(state, { cursor: "" }) : null;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${pageTitle}</title>
    <style>${styles}</style>
  </head>
  <body>
    <main class="page">
      <section class="hero">
        <p class="hero__eyebrow">SQLite Preview</p>
        <h1>${pageTitle}</h1>
        <p>Mixed-provider release timeline pulled from the normalized events table. Use the filters to browse launches, rollouts, release notes, and deprecations without leaving the Hono server.</p>
        <div class="hero__links">
          <a href="${safeHref(input.eventsJsonHref)}" target="_blank" rel="noreferrer">Current JSON</a>
          <a href="${safeHref(input.calendarHref)}" target="_blank" rel="noreferrer">Current ICS</a>
          <a href="${safeHref(input.sourcesHref)}" target="_blank" rel="noreferrer">Source Status</a>
        </div>
      </section>

      <section class="controls">
        <form method="get" action="/feeds">
          <div class="controls__grid">
            <label>
              Vendor
              <select name="vendor">${renderSelectOptions(vendorOptions, state.vendor)}</select>
            </label>
            <label>
              Category
              <select name="category">${renderSelectOptions(categoryOptions, state.category)}</select>
            </label>
            <label>
              Product
              <input type="text" name="product" value="${escapeHtml(state.product)}" placeholder="e.g. chatgpt" />
            </label>
            <label>
              Model
              <input type="text" name="model" value="${escapeHtml(state.model)}" placeholder="e.g. claude-opus-4.6" />
            </label>
            <label>
              Since
              <input type="date" name="since" value="${escapeHtml(state.since)}" />
            </label>
            <label>
              Until
              <input type="date" name="until" value="${escapeHtml(state.until)}" />
            </label>
            <label>
              Per page
              <select name="limit">${renderSelectOptions(
                [
                  { value: "25", label: "25" },
                  { value: "50", label: "50" },
                  { value: "100", label: "100" },
                ],
                String(state.limit)
              )}</select>
            </label>
          </div>
          <div class="controls__actions">
            <button type="submit">Apply filters</button>
            <a href="/feeds">Reset</a>
            ${newestHref ? `<a href="${safeHref(newestHref)}">Newest</a>` : ""}
          </div>
        </form>
      </section>

      <section class="summary">
        <p class="summary__heading" data-summary-heading>${escapeHtml(renderSummaryHeading(input.events.length, input.hasMore))}</p>
        <div class="chips">
          ${chips.map((chip) => `<span class="chip"><strong>${escapeHtml(chip.label)}:</strong><span>${escapeHtml(chip.value)}</span></span>`).join("")}
        </div>
      </section>

      <section class="timeline-shell">
        ${
          input.events.length
            ? `<ol class="timeline" data-timeline>${renderTimelineItems(input.events)}</ol>`
            : `<p class="empty-state">No events matched the current filters. Try widening the date range, switching category, or clearing product/model filters.</p>`
        }
        ${renderLoaderSection(input)}
        ${renderNoscriptPagination(olderHref, newestHref)}
      </section>
    </main>
    <script>${inlineScript}</script>
  </body>
</html>`;
};
