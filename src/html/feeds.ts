import {
  ALLOWED_CATEGORIES,
  ALLOWED_VENDORS,
  type EventCategory,
  type EventDateKind,
  type EventRow,
  type Vendor,
} from "../types.js";
import {
  buildDailyCountsFromEvents,
  buildFeedsChartModel,
  type FeedsChartModel,
} from "./chart.js";

export interface FeedsPageState {
  vendors: Vendor[];
  categories: EventCategory[];
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
  chart: FeedsChartModel | null;
  eventsJsonHref: string;
  calendarHref: string;
  sourcesHref: string;
  itemsHref: string;
}

export interface StaticFeedsEventSnapshot {
  id: string;
  vendor: Vendor;
  category: EventCategory;
  event_date: string;
  event_date_kind: EventDateKind;
  products: string[];
  models: string[];
  html: string;
}

export interface StaticFeedsPageInput {
  events: EventRow[];
  hasMore: boolean;
  state: FeedsPageState;
  chart: FeedsChartModel | null;
  dataHref: string;
  exportedAt: string;
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
  if (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("?") ||
    value.startsWith("#")
  ) {
    return escapeHtml(value);
  }
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

const formatUtcDate = (value: string) => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return escapeHtml(value);
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

const renderCheckboxOptions = (
  name: string,
  options: Array<{ value: string; label: string }>,
  selectedValues: string[]
) =>
  options
    .map((option) => {
      const checked = selectedValues.includes(option.value) ? " checked" : "";
      const id = `${name}-${option.value}`;
      return `
                <label class="checkbox-option" for="${escapeHtml(id)}">
                  <input id="${escapeHtml(id)}" type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(option.value)}"${checked} />
                  <span>${escapeHtml(option.label)}</span>
                </label>
      `;
    })
    .join("");

const buildPageHrefFor = (basePath: string, state: FeedsPageState, overrides: Partial<FeedsPageState> = {}) => {
  const next = { ...state, ...overrides };
  const params = new URLSearchParams();
  for (const vendor of next.vendors) params.append("vendor", vendor);
  if (next.categories.length) {
    for (const category of next.categories) params.append("category", category);
  } else {
    params.append("category", "all");
  }
  if (next.product) params.set("product", next.product);
  if (next.model) params.set("model", next.model);
  if (next.since) params.set("since", next.since);
  if (next.until) params.set("until", next.until);
  params.set("limit", String(next.limit));
  if (next.cursor) params.set("cursor", next.cursor);
  return `${basePath}?${params.toString()}`;
};

const buildPageHref = (state: FeedsPageState, overrides: Partial<FeedsPageState> = {}) =>
  buildPageHrefFor("/feeds", state, overrides);

const activeFilterChips = (state: FeedsPageState) => {
  const chips: Array<{ label: string; value: string }> = [];
  if (state.vendors.length) {
    for (const vendor of state.vendors) {
      chips.push({ label: "Vendor", value: vendorLabels[vendor] ?? humanizeToken(vendor) });
    }
  } else {
    chips.push({ label: "Vendor", value: "All" });
  }
  if (state.categories.length) {
    for (const category of state.categories) {
      chips.push({ label: "Category", value: humanizeToken(category) });
    }
  } else {
    chips.push({ label: "Category", value: "All" });
  }
  if (state.product) chips.push({ label: "Product", value: state.product });
  if (state.model) chips.push({ label: "Model", value: state.model });
  if (state.since) chips.push({ label: "Since", value: state.since });
  if (state.until) chips.push({ label: "Until", value: state.until });
  chips.push({ label: "Per page", value: String(state.limit) });
  return chips;
};

const renderTimelineItemHtml = (event: EventRow, options: { includeJsonLink?: boolean } = {}) => {
  const includeJsonLink = options.includeJsonLink !== false;
  const summary = renderSummaryText(event);
  const vendorLabel = vendorLabels[event.vendor] ?? humanizeToken(event.vendor);
  const categoryLabel = humanizeToken(event.category);
  const sourceHref = safeHref(event.canonical_url);
  const jsonHref = includeJsonLink ? safeHref(`/events/${encodeURIComponent(event.id)}`) : null;
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
          ${jsonHref ? `<a href="${jsonHref}" target="_blank" rel="noreferrer">JSON</a>` : ""}
        </div>
      </article>
    </li>
  `;
};

const renderTimelineItemsHtml = (events: EventRow[], options: { includeJsonLink?: boolean } = {}) =>
  events.map((event) => renderTimelineItemHtml(event, options)).join("");

export const renderTimelineItems = (events: EventRow[]) => renderTimelineItemsHtml(events);

export const createStaticFeedsEventSnapshot = (event: EventRow): StaticFeedsEventSnapshot => ({
  id: event.id,
  vendor: event.vendor,
  category: event.category,
  event_date: event.event_date,
  event_date_kind: event.event_date_kind,
  products: event.products,
  models: event.models,
  html: renderTimelineItemHtml(event, { includeJsonLink: false }),
});

export const buildChartFromEvents = (
  events: Array<{ event_date: string }>,
  selection: { since?: string | null; until?: string | null } = {}
) => buildFeedsChartModel(buildDailyCountsFromEvents(events), selection);

const renderSummaryHeading = (count: number, hasMore: boolean) =>
  `Showing ${count} event${count === 1 ? "" : "s"}${hasMore ? " with older pages available" : ""}.`;

const renderFilterSummaryChips = (state: FeedsPageState) =>
  activeFilterChips(state)
    .map((chip) => `<span class="chip"><strong>${escapeHtml(chip.label)}:</strong><span>${escapeHtml(chip.value)}</span></span>`)
    .join("");

const renderForm = (
  state: FeedsPageState,
  options: {
    action: string;
    resetHref: string;
    newestHref?: string | null;
    formAttribute?: string;
  }
) => {
  const vendorOptions = ALLOWED_VENDORS.map((vendor) => ({
    value: vendor,
    label: vendorLabels[vendor] ?? humanizeToken(vendor),
  }));
  const categoryOptions = ALLOWED_CATEGORIES.map((category) => ({
    value: category,
    label: humanizeToken(category),
  }));

  return `
      <section class="controls">
        <form method="get" action="${safeHref(options.action)}"${options.formAttribute ? ` ${options.formAttribute}` : ""}>
          <div class="controls__grid">
            <fieldset class="checkbox-fieldset">
              <legend class="checkbox-fieldset__legend">Vendor</legend>
              <input type="hidden" name="vendor" value="all" />
              <div class="checkbox-grid">
                ${renderCheckboxOptions("vendor", vendorOptions, state.vendors)}
              </div>
            </fieldset>
            <fieldset class="checkbox-fieldset">
              <legend class="checkbox-fieldset__legend">Category</legend>
              <input type="hidden" name="category" value="all" />
              <div class="checkbox-grid">
                ${renderCheckboxOptions("category", categoryOptions, state.categories)}
              </div>
            </fieldset>
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
            <a href="${safeHref(options.resetHref)}" data-reset-link>Reset</a>
            ${options.newestHref ? `<a href="${safeHref(options.newestHref)}">Newest</a>` : ""}
          </div>
        </form>
      </section>
  `;
};

const renderSummarySection = (state: FeedsPageState, count: number, hasMore: boolean) => `
      <section class="summary">
        <p class="summary__heading" data-summary-heading>${escapeHtml(renderSummaryHeading(count, hasMore))}</p>
        <div class="chips" data-filter-chips>
          ${renderFilterSummaryChips(state)}
        </div>
      </section>
`;

const chartUnitLabels: Record<FeedsChartModel["unit"], string> = {
  day: "day",
  week: "week",
  month: "month",
};

const renderChartSection = (
  chart: FeedsChartModel | null,
  state: FeedsPageState,
  options: { basePath: string }
) => {
  if (!chart || !chart.buckets.length) return "";

  const chartWidth = Math.max(660, chart.buckets.length * 38 + 56);
  const chartHeight = 220;
  const plotTop = 20;
  const plotBottom = 160;
  const plotHeight = plotBottom - plotTop;
  const leftPad = 28;
  const rightPad = 20;
  const baselineY = plotBottom;
  const slotWidth = (chartWidth - leftPad - rightPad) / chart.buckets.length;
  const barWidth = Math.max(14, slotWidth * 0.62);
  const labelStep = chart.buckets.length > 28 ? 4 : chart.buckets.length > 16 ? 2 : 1;
  const clearHref =
    state.since || state.until ? buildPageHrefFor(options.basePath, state, { since: "", until: "", cursor: "" }) : null;

  const gridValues = [chart.maxCount, Math.max(1, Math.ceil(chart.maxCount / 2)), 0]
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((left, right) => right - left);

  return `
      <section class="chart-shell" data-chart-root>
        <div class="chart__header">
          <div>
            <p class="chart__eyebrow">Release Rhythm</p>
            <h2 class="chart__title">Release activity over time</h2>
            <p class="chart__copy">Select a ${escapeHtml(chartUnitLabels[chart.unit])} to focus the timeline while keeping the broader release curve visible.</p>
          </div>
          <div class="chart__meta">
            <p class="chart__selection">${escapeHtml(chart.selectionLabel ? `Focused: ${chart.selectionLabel}` : `Showing all ${chart.totalCount} events across the current non-date filters.`)}</p>
            ${clearHref ? `<a class="chart__clear" href="${safeHref(clearHref)}" data-chart-clear>Clear date focus</a>` : ""}
          </div>
        </div>
        <div class="chart-scroll">
          <svg
            class="chart-svg"
            viewBox="0 0 ${chartWidth} ${chartHeight}"
            width="${chartWidth}"
            height="${chartHeight}"
            role="img"
            aria-label="Histogram of event counts over time"
          >
            <rect x="0" y="0" width="${chartWidth}" height="${chartHeight}" rx="18" class="chart__backdrop"></rect>
            ${gridValues
              .map((value) => {
                const y = plotTop + (1 - value / chart.maxCount) * plotHeight;
                return `
            <line x1="${leftPad}" y1="${y}" x2="${chartWidth - rightPad}" y2="${y}" class="chart__grid"></line>
            <text x="8" y="${y + 4}" class="chart__axis">${value}</text>
                `;
              })
              .join("")}
            <line x1="${leftPad}" y1="${baselineY}" x2="${chartWidth - rightPad}" y2="${baselineY}" class="chart__baseline"></line>
            ${chart.buckets
              .map((bucket, index) => {
                const slotX = leftPad + index * slotWidth;
                const x = slotX + (slotWidth - barWidth) / 2;
                const height = bucket.count > 0 ? Math.max(6, (bucket.count / chart.maxCount) * plotHeight) : 0;
                const y = baselineY - height;
                const labelY = chartHeight - 16;
                const showLabel = index % labelStep === 0 || bucket.active;
                const href = buildPageHrefFor(options.basePath, state, {
                  since: bucket.startDay,
                  until: bucket.endDay,
                  cursor: "",
                });
                if (bucket.count <= 0) {
                  return `
            <g class="chart__bucket chart__bucket--empty" aria-hidden="true">
              <rect x="${x}" y="${baselineY - 1}" width="${barWidth}" height="2" rx="1" class="chart-bar chart-bar--empty"></rect>
              ${showLabel ? `<text x="${slotX + slotWidth / 2}" y="${labelY}" text-anchor="middle" class="chart__label">${escapeHtml(bucket.shortLabel)}</text>` : ""}
            </g>
                  `;
                }
                return `
            <a
              href="${safeHref(href)}"
              class="chart__bucket${bucket.active ? " chart__bucket--active" : ""}"
              data-chart-bucket
              data-chart-start="${escapeHtml(bucket.startDay)}"
              data-chart-end="${escapeHtml(bucket.endDay)}"
              aria-label="${escapeHtml(bucket.ariaLabel)}"
            >
              <title>${escapeHtml(bucket.ariaLabel)}</title>
              <rect x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="8" class="chart-bar${bucket.active ? " chart-bar--active" : ""}"></rect>
              ${showLabel ? `<text x="${slotX + slotWidth / 2}" y="${labelY}" text-anchor="middle" class="chart__label${bucket.active ? " chart__label--active" : ""}">${escapeHtml(bucket.shortLabel)}</text>` : ""}
            </a>
                `;
              })
              .join("")}
          </svg>
        </div>
      </section>
  `;
};

const renderTimelineSection = (input: {
  events: EventRow[];
  timelineHtml: string;
  emptyMessage: string;
  afterTimelineHtml?: string;
}) => `
      <section class="timeline-shell">
        ${
          input.events.length
            ? `<ol class="timeline" data-timeline>${input.timelineHtml}</ol>`
            : `<p class="empty-state">${escapeHtml(input.emptyMessage)}</p>`
        }
        ${input.afterTimelineHtml ?? ""}
      </section>
`;

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

const liveInlineScript = `
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
      setStatus("You've reached the end of the timeline.");
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
    setStatus(trigger === "manual" ? "Loading more events..." : "Loading older events...");

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
      setStatus(hasMore ? "Loaded more events." : "You've reached the end of the timeline.");
    } catch {
      setStatus("Couldn't load older events. Tap Load more to retry.");
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

const renderStaticInlineScript = () => `
(() => {
  const root = document.querySelector("[data-static-feeds]");
  const form = document.querySelector("[data-feeds-form]");
  const chartRoot = document.querySelector("[data-chart-root]");
  const summary = document.querySelector("[data-summary-heading]");
  const chips = document.querySelector("[data-filter-chips]");
  const timeline = document.querySelector("[data-timeline]");
  const emptyState = document.querySelector("[data-empty-state]");
  const loader = document.querySelector("[data-static-loader]");
  const resetLink = document.querySelector("[data-reset-link]");
  if (
    !(root instanceof HTMLElement) ||
    !(form instanceof HTMLFormElement) ||
    !(chartRoot instanceof HTMLElement) ||
    !(summary instanceof HTMLElement) ||
    !(chips instanceof HTMLElement) ||
    !(timeline instanceof HTMLElement) ||
    !(emptyState instanceof HTMLElement) ||
    !(loader instanceof HTMLElement)
  ) {
    return;
  }

  const button = loader.querySelector("[data-load-more]");
  const status = loader.querySelector("[data-loader-status]");
  const sentinel = loader.querySelector("[data-loader-sentinel]");
  if (!(button instanceof HTMLButtonElement) || !(status instanceof HTMLElement) || !(sentinel instanceof HTMLElement)) {
    return;
  }

  const allowedVendors = ${JSON.stringify(ALLOWED_VENDORS)};
  const allowedCategories = ${JSON.stringify(ALLOWED_CATEGORIES)};
  const vendorLabels = ${JSON.stringify(vendorLabels)};
  const defaultCategories = ["model_release"];
  const defaultLimit = Number(root.dataset.defaultLimit || "50");
  const dataHref = root.dataset.dataHref || "";
  const dayMs = 24 * 60 * 60 * 1000;
  let allEvents = null;
  let baseFilteredEvents = [];
  let filteredEvents = [];
  let visibleCount = 0;
  let currentState = null;
  let loading = false;
  let observer = null;

  const shortDayFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const fullDayFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const monthFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const monthShortFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  const humanizeToken = (value) =>
    String(value || "")
      .replace(/_/g, " ")
      .replace(/\\b\\w/g, (match) => match.toUpperCase());

  const toDayString = (value) => {
    const trimmed = String(value || "").trim();
    const match = trimmed.match(/^(\\d{4}-\\d{2}-\\d{2})/);
    return match ? match[1] : "";
  };

  const parseDay = (day) => Date.parse(day + "T00:00:00.000Z");

  const formatDayFromMs = (value) => new Date(value).toISOString().slice(0, 10);

  const formatShortDay = (day) => shortDayFormatter.format(new Date(day + "T00:00:00.000Z"));

  const formatFullDay = (day) => fullDayFormatter.format(new Date(day + "T00:00:00.000Z"));

  const formatMonthLabel = (day) => monthFormatter.format(new Date(day + "T00:00:00.000Z"));

  const formatMonthShort = (day) => monthShortFormatter.format(new Date(day + "T00:00:00.000Z"));

  const startOfWeek = (value) => {
    const date = new Date(value);
    const day = date.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    return value + mondayOffset * dayMs;
  };

  const startOfMonth = (value) => {
    const date = new Date(value);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  };

  const addDays = (value, days) => value + days * dayMs;

  const addWeeks = (value, weeks) => addDays(value, weeks * 7);

  const addMonths = (value, months) => {
    const date = new Date(value);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
  };

  const bucketUnitForRange = (rangeDays) => {
    if (rangeDays <= 45) return "day";
    if (rangeDays <= 240) return "week";
    return "month";
  };

  const formatSelectionLabel = (sinceDay, untilDay) => {
    if (sinceDay && untilDay) {
      if (sinceDay === untilDay) return formatFullDay(sinceDay);
      return formatFullDay(sinceDay) + " to " + formatFullDay(untilDay);
    }
    if (sinceDay) return "From " + formatFullDay(sinceDay);
    if (untilDay) return "Through " + formatFullDay(untilDay);
    return "";
  };

  const formatBucketLabels = (unit, startDay, endDay) => {
    if (unit === "day") {
      return {
        label: formatFullDay(startDay),
        shortLabel: formatShortDay(startDay),
      };
    }
    if (unit === "week") {
      return {
        label: formatFullDay(startDay) + " to " + formatFullDay(endDay),
        shortLabel: formatShortDay(startDay),
      };
    }
    return {
      label: formatMonthLabel(startDay),
      shortLabel: formatMonthShort(startDay),
    };
  };

  const readSelectedValues = (name, allowed) => {
    const selected = [];
    const seen = new Set();
    for (const input of form.querySelectorAll('input[type="checkbox"][name="' + name + '"]')) {
      if (!(input instanceof HTMLInputElement) || !input.checked) continue;
      const value = input.value.trim();
      if (!allowed.includes(value) || seen.has(value)) continue;
      seen.add(value);
      selected.push(value);
    }
    return selected;
  };

  const clampLimit = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return defaultLimit;
    return Math.min(parsed, 200);
  };

  const readMultiFromSearch = (params, key, allowed) => {
    const selected = [];
    const seen = new Set();
    for (const rawValue of params.getAll(key)) {
      for (const part of rawValue.split(",")) {
        const candidate = part.trim();
        if (!candidate || candidate === "all" || !allowed.includes(candidate) || seen.has(candidate)) continue;
        seen.add(candidate);
        selected.push(candidate);
      }
    }
    return selected;
  };

  const readStateFromSearch = () => {
    const params = new URLSearchParams(window.location.search);
    const hasCategoryParam = params.has("category");
    return {
      vendors: readMultiFromSearch(params, "vendor", allowedVendors),
      categories: hasCategoryParam ? readMultiFromSearch(params, "category", allowedCategories) : defaultCategories.slice(),
      product: (params.get("product") || "").trim(),
      model: (params.get("model") || "").trim(),
      since: toDayString(params.get("since")),
      until: toDayString(params.get("until")),
      limit: clampLimit(params.get("limit") || defaultLimit),
    };
  };

  const readStateFromForm = () => {
    const productInput = form.querySelector('input[name="product"]');
    const modelInput = form.querySelector('input[name="model"]');
    const sinceInput = form.querySelector('input[name="since"]');
    const untilInput = form.querySelector('input[name="until"]');
    const limitInput = form.querySelector('select[name="limit"]');
    return {
      vendors: readSelectedValues("vendor", allowedVendors),
      categories: readSelectedValues("category", allowedCategories),
      product: productInput instanceof HTMLInputElement ? productInput.value.trim() : "",
      model: modelInput instanceof HTMLInputElement ? modelInput.value.trim() : "",
      since: sinceInput instanceof HTMLInputElement ? toDayString(sinceInput.value) : "",
      until: untilInput instanceof HTMLInputElement ? toDayString(untilInput.value) : "",
      limit: clampLimit(limitInput instanceof HTMLSelectElement ? limitInput.value : defaultLimit),
    };
  };

  const syncForm = (state) => {
    for (const input of form.querySelectorAll('input[type="checkbox"][name="vendor"]')) {
      if (input instanceof HTMLInputElement) {
        input.checked = state.vendors.includes(input.value);
      }
    }
    for (const input of form.querySelectorAll('input[type="checkbox"][name="category"]')) {
      if (input instanceof HTMLInputElement) {
        input.checked = state.categories.includes(input.value);
      }
    }
    const productInput = form.querySelector('input[name="product"]');
    if (productInput instanceof HTMLInputElement) productInput.value = state.product;
    const modelInput = form.querySelector('input[name="model"]');
    if (modelInput instanceof HTMLInputElement) modelInput.value = state.model;
    const sinceInput = form.querySelector('input[name="since"]');
    if (sinceInput instanceof HTMLInputElement) sinceInput.value = state.since;
    const untilInput = form.querySelector('input[name="until"]');
    if (untilInput instanceof HTMLInputElement) untilInput.value = state.until;
    const limitInput = form.querySelector('select[name="limit"]');
    if (limitInput instanceof HTMLSelectElement) limitInput.value = String(state.limit);
  };

  const buildStateSearch = (state) => {
    const params = new URLSearchParams();
    for (const vendor of state.vendors) params.append("vendor", vendor);
    if (state.categories.length) {
      for (const category of state.categories) params.append("category", category);
    } else {
      params.append("category", "all");
    }
    if (state.product) params.set("product", state.product);
    if (state.model) params.set("model", state.model);
    if (state.since) params.set("since", state.since);
    if (state.until) params.set("until", state.until);
    params.set("limit", String(state.limit));
    return params.toString();
  };

  const summaryText = (count, hasMore) => {
    return "Showing " + count + " event" + (count === 1 ? "" : "s") + (hasMore ? " with older pages available." : ".");
  };

  const setStatus = (message) => {
    status.textContent = message;
  };

  const setChips = (state) => {
    chips.textContent = "";
    const values = [];
    if (state.vendors.length) {
      for (const vendor of state.vendors) {
        values.push({ label: "Vendor", value: vendorLabels[vendor] || humanizeToken(vendor) });
      }
    } else {
      values.push({ label: "Vendor", value: "All" });
    }
    if (state.categories.length) {
      for (const category of state.categories) {
        values.push({ label: "Category", value: humanizeToken(category) });
      }
    } else {
      values.push({ label: "Category", value: "All" });
    }
    if (state.product) values.push({ label: "Product", value: state.product });
    if (state.model) values.push({ label: "Model", value: state.model });
    if (state.since) values.push({ label: "Since", value: state.since });
    if (state.until) values.push({ label: "Until", value: state.until });
    values.push({ label: "Per page", value: String(state.limit) });

    for (const chipValue of values) {
      const chip = document.createElement("span");
      chip.className = "chip";
      const label = document.createElement("strong");
      label.textContent = chipValue.label + ":";
      const value = document.createElement("span");
      value.textContent = chipValue.value;
      chip.append(label, value);
      chips.append(chip);
    }
  };

  const matchesCoreState = (event, state) => {
    if (state.vendors.length && !state.vendors.includes(event.vendor)) return false;
    if (state.categories.length && !state.categories.includes(event.category)) return false;
    if (state.product && (!Array.isArray(event.products) || !event.products.includes(state.product))) return false;
    if (state.model && (!Array.isArray(event.models) || !event.models.includes(state.model))) return false;
    return true;
  };

  const matchesState = (event, state) => {
    if (!matchesCoreState(event, state)) return false;
    const eventDay = toDayString(event.event_date);
    if (state.since && eventDay < state.since) return false;
    if (state.until && eventDay > state.until) return false;
    return true;
  };

  const buildDailyCounts = (events) => {
    const counts = new Map();
    for (const event of events) {
      const day = toDayString(event.event_date);
      if (!day) continue;
      counts.set(day, (counts.get(day) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([day, count]) => ({ day, count }));
  };

  const buildChartModel = (events, state) => {
    const dailyCounts = buildDailyCounts(events);
    if (!dailyCounts.length) return null;

    const firstDay = dailyCounts[0].day;
    const lastDay = dailyCounts[dailyCounts.length - 1].day;
    const firstMs = parseDay(firstDay);
    const lastMs = parseDay(lastDay);
    const rangeDays = Math.floor((lastMs - firstMs) / dayMs) + 1;
    const unit = bucketUnitForRange(rangeDays);
    const selectedSince = toDayString(state.since);
    const selectedUntil = toDayString(state.until);
    const countsByDay = new Map(dailyCounts.map((entry) => [entry.day, entry.count]));
    const buckets = [];
    let cursor = unit === "day" ? firstMs : unit === "week" ? startOfWeek(firstMs) : startOfMonth(firstMs);
    const boundary = unit === "day" ? lastMs : unit === "week" ? startOfWeek(lastMs) : startOfMonth(lastMs);

    while (cursor <= boundary) {
      const startDay = formatDayFromMs(cursor);
      const rawEnd = unit === "day" ? cursor : unit === "week" ? addDays(cursor, 6) : addDays(addMonths(cursor, 1), -1);
      const endDay = formatDayFromMs(rawEnd);
      let count = 0;
      for (const [day, value] of countsByDay.entries()) {
        if (day >= startDay && day <= endDay) count += value;
      }
      const labels = formatBucketLabels(unit, startDay, endDay);
      buckets.push({
        key: startDay + ":" + endDay,
        startDay,
        endDay,
        label: labels.label,
        shortLabel: labels.shortLabel,
        count,
        active: selectedSince === startDay && selectedUntil === endDay,
        ariaLabel: labels.label + ": " + count + " event" + (count === 1 ? "" : "s"),
      });
      cursor = unit === "day" ? addDays(cursor, 1) : unit === "week" ? addWeeks(cursor, 1) : addMonths(cursor, 1);
    }

    const totalCount = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
    const maxCount = Math.max.apply(
      null,
      buckets.map((bucket) => bucket.count).concat([1])
    );
    const activeBucket = buckets.find((bucket) => bucket.active);
    return {
      unit,
      buckets,
      totalCount,
      maxCount,
      selectionLabel: activeBucket ? activeBucket.label : formatSelectionLabel(selectedSince, selectedUntil),
    };
  };

  const buildChartHtml = (chart, state) => {
    if (!chart || !chart.buckets.length) return "";
    const chartWidth = Math.max(660, chart.buckets.length * 38 + 56);
    const chartHeight = 220;
    const plotTop = 20;
    const plotBottom = 160;
    const plotHeight = plotBottom - plotTop;
    const leftPad = 28;
    const rightPad = 20;
    const slotWidth = (chartWidth - leftPad - rightPad) / chart.buckets.length;
    const barWidth = Math.max(14, slotWidth * 0.62);
    const labelStep = chart.buckets.length > 28 ? 4 : chart.buckets.length > 16 ? 2 : 1;
    const unitLabel = chart.unit === "day" ? "day" : chart.unit === "week" ? "week" : "month";
    const clearHref =
      state.since || state.until
        ? "./?" + buildStateSearch({ ...state, since: "", until: "" })
        : "";
    const gridValues = Array.from(new Set([chart.maxCount, Math.max(1, Math.ceil(chart.maxCount / 2)), 0])).sort(
      (left, right) => right - left
    );
    return [
      '<div class="chart__header">',
      "<div>",
      '<p class="chart__eyebrow">Release Rhythm</p>',
      '<h2 class="chart__title">Release activity over time</h2>',
      '<p class="chart__copy">Select a ' + unitLabel + " to focus the timeline while keeping the broader release curve visible.</p>",
      "</div>",
      '<div class="chart__meta">',
      '<p class="chart__selection">' +
        (chart.selectionLabel
          ? "Focused: " + chart.selectionLabel
          : "Showing all " + chart.totalCount + " events across the current non-date filters.") +
        "</p>",
      clearHref ? '<a class="chart__clear" href="' + clearHref + '" data-chart-clear>Clear date focus</a>' : "",
      "</div>",
      "</div>",
      '<div class="chart-scroll">',
      '<svg class="chart-svg" viewBox="0 0 ' +
        chartWidth +
        " " +
        chartHeight +
        '" width="' +
        chartWidth +
        '" height="' +
        chartHeight +
        '" role="img" aria-label="Histogram of event counts over time">',
      '<rect x="0" y="0" width="' + chartWidth + '" height="' + chartHeight + '" rx="18" class="chart__backdrop"></rect>',
      gridValues
        .map((value) => {
          const y = plotTop + (1 - value / chart.maxCount) * plotHeight;
          return (
            '<line x1="' +
            leftPad +
            '" y1="' +
            y +
            '" x2="' +
            (chartWidth - rightPad) +
            '" y2="' +
            y +
            '" class="chart__grid"></line><text x="8" y="' +
            (y + 4) +
            '" class="chart__axis">' +
            value +
            "</text>"
          );
        })
        .join(""),
      '<line x1="' +
        leftPad +
        '" y1="' +
        plotBottom +
        '" x2="' +
        (chartWidth - rightPad) +
        '" y2="' +
        plotBottom +
        '" class="chart__baseline"></line>',
      chart.buckets
        .map((bucket, index) => {
          const slotX = leftPad + index * slotWidth;
          const x = slotX + (slotWidth - barWidth) / 2;
          const height = bucket.count > 0 ? Math.max(6, (bucket.count / chart.maxCount) * plotHeight) : 0;
          const y = plotBottom - height;
          const labelY = chartHeight - 16;
          const showLabel = index % labelStep === 0 || bucket.active;
          if (bucket.count <= 0) {
            return (
              '<g class="chart__bucket chart__bucket--empty" aria-hidden="true"><rect x="' +
              x +
              '" y="' +
              (plotBottom - 1) +
              '" width="' +
              barWidth +
              '" height="2" rx="1" class="chart-bar chart-bar--empty"></rect>' +
              (showLabel
                ? '<text x="' +
                  (slotX + slotWidth / 2) +
                  '" y="' +
                  labelY +
                  '" text-anchor="middle" class="chart__label">' +
                  bucket.shortLabel +
                  "</text>"
                : "") +
              "</g>"
            );
          }
          const href =
            "./?" +
            buildStateSearch({
              ...state,
              since: bucket.startDay,
              until: bucket.endDay,
            });
          return (
            '<a href="' +
            href +
            '" class="chart__bucket' +
            (bucket.active ? " chart__bucket--active" : "") +
            '" data-chart-bucket data-chart-start="' +
            bucket.startDay +
            '" data-chart-end="' +
            bucket.endDay +
            '" aria-label="' +
            bucket.ariaLabel.replace(/"/g, "&quot;") +
            '"><title>' +
            bucket.ariaLabel.replace(/</g, "&lt;").replace(/>/g, "&gt;") +
            "</title><rect x=\"" +
            x +
            '" y="' +
            y +
            '" width="' +
            barWidth +
            '" height="' +
            height +
            '" rx="8" class="chart-bar' +
            (bucket.active ? " chart-bar--active" : "") +
            '"></rect>' +
            (showLabel
              ? '<text x="' +
                (slotX + slotWidth / 2) +
                '" y="' +
                labelY +
                '" text-anchor="middle" class="chart__label' +
                (bucket.active ? " chart__label--active" : "") +
                '">' +
                bucket.shortLabel +
                "</text>"
              : "") +
            "</a>"
          );
        })
        .join(""),
      "</svg>",
      "</div>",
    ].join("");
  };

  const updateControls = () => {
    const hasMore = visibleCount < filteredEvents.length;
    summary.textContent = summaryText(Math.min(visibleCount, filteredEvents.length), hasMore);
    setChips(currentState);
    loader.hidden = allEvents === null;
    button.disabled = loading || !hasMore;
    button.hidden = !hasMore;
    sentinel.hidden = !hasMore;
    if (filteredEvents.length === 0 && !loading && allEvents !== null) {
      setStatus("No events matched the current filters.");
      return;
    }
    if (!loading && !hasMore && allEvents !== null) {
      setStatus("You've reached the end of the timeline.");
      return;
    }
    if (!loading && hasMore) {
      setStatus("Scroll for older events or tap Load more.");
    }
  };

  const renderVisibleEvents = (append) => {
    if (!allEvents) return;
    const nextVisible = Math.min(filteredEvents.length, visibleCount + currentState.limit);
    const slice = filteredEvents.slice(append ? visibleCount : 0, nextVisible);
    const html = slice.map((event) => String(event.html || "")).join("");
    if (!append) {
      timeline.innerHTML = html;
    } else if (html) {
      timeline.insertAdjacentHTML("beforeend", html);
    }
    visibleCount = nextVisible;
    timeline.hidden = filteredEvents.length === 0;
    emptyState.hidden = filteredEvents.length !== 0;
  };

  const renderChart = () => {
    if (!allEvents) return;
    const chart = buildChartModel(baseFilteredEvents, currentState);
    if (!chart) {
      chartRoot.hidden = true;
      chartRoot.innerHTML = "";
      return;
    }
    chartRoot.hidden = false;
    chartRoot.innerHTML = buildChartHtml(chart, currentState);
  };

  const applyState = (state, pushHistory) => {
    currentState = state;
    syncForm(state);
    if (!allEvents) {
      setChips(state);
      summary.textContent = summaryText(Number(root.dataset.initialCount || "0"), root.dataset.initialHasMore === "true");
      return;
    }
    baseFilteredEvents = allEvents.filter((event) => matchesCoreState(event, state));
    filteredEvents = baseFilteredEvents.filter((event) => matchesState(event, state));
    visibleCount = 0;
    renderChart();
    renderVisibleEvents(false);
    updateControls();
    if (pushHistory) {
      const nextSearch = buildStateSearch(state);
      const nextUrl = nextSearch ? "./?" + nextSearch : "./";
      window.history.pushState(null, "", nextUrl);
    }
  };

  const loadMore = (trigger) => {
    if (loading || !allEvents || visibleCount >= filteredEvents.length) {
      return;
    }
    loading = true;
    updateControls();
    setStatus(trigger === "manual" ? "Loading more events..." : "Loading older events...");
    renderVisibleEvents(true);
    loading = false;
    updateControls();
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    applyState(readStateFromForm(), true);
  });

  chartRoot.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-chart-bucket], [data-chart-clear]") : null;
    if (!(target instanceof HTMLAnchorElement)) return;
    event.preventDefault();
    if (target.hasAttribute("data-chart-clear")) {
      applyState({ ...currentState, since: "", until: "" }, true);
      return;
    }
    applyState(
      {
        ...currentState,
        since: target.dataset.chartStart || "",
        until: target.dataset.chartEnd || "",
      },
      true
    );
  });

  if (resetLink instanceof HTMLAnchorElement) {
    resetLink.addEventListener("click", (event) => {
      event.preventDefault();
      applyState({
        vendors: [],
        categories: defaultCategories.slice(),
        product: "",
        model: "",
        since: "",
        until: "",
        limit: defaultLimit,
      }, true);
    });
  }

  button.addEventListener("click", () => {
    loadMore("manual");
  });

  window.addEventListener("popstate", () => {
    applyState(readStateFromSearch(), false);
  });

  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadMore("auto");
      }
    }, {
      rootMargin: "480px 0px",
    });
    observer.observe(sentinel);
  }

  currentState = readStateFromSearch();
  syncForm(currentState);
  setChips(currentState);
  loader.hidden = false;
  setStatus("Loading snapshot...");

  fetch(new URL(dataHref, window.location.href).toString(), {
    headers: {
      "Accept": "application/json",
    },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("request failed");
      return response.json();
    })
    .then((payload) => {
      if (!payload || !Array.isArray(payload.events)) {
        throw new Error("invalid payload");
      }
      allEvents = payload.events;
      baseFilteredEvents = payload.events;
      applyState(currentState, false);
    })
    .catch(() => {
      loader.hidden = false;
      setStatus("Couldn't load the static snapshot data.");
      button.hidden = true;
      sentinel.hidden = true;
    });
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
    min-width: 0;
  }

  .controls input,
  .controls select {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 44px;
    border-radius: 14px;
    border: 1px solid var(--line);
    background: #fff;
    padding: 0 14px;
    color: var(--ink);
    font: 500 0.98rem/1.2 "Helvetica Neue", Arial, sans-serif;
  }

  .controls input[type="date"] {
    display: block;
    inline-size: 100%;
    min-inline-size: 0;
    padding-right: 12px;
    font-variant-numeric: tabular-nums;
  }

  .checkbox-fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .checkbox-fieldset__legend {
    margin: 0 0 8px;
    padding: 0;
    font: 600 0.84rem/1.2 "Helvetica Neue", Arial, sans-serif;
    color: var(--muted);
    letter-spacing: 0.01em;
  }

  .checkbox-grid {
    display: grid;
    gap: 10px;
  }

  .checkbox-option {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 10px 12px;
    border-radius: 14px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.92);
    color: var(--ink);
    cursor: pointer;
  }

  .checkbox-option input {
    width: 18px;
    height: 18px;
    min-height: 18px;
    margin: 0;
    flex: 0 0 auto;
  }

  .checkbox-option span {
    min-width: 0;
    font: 500 0.94rem/1.3 "Helvetica Neue", Arial, sans-serif;
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

  .chart-shell {
    margin-top: 20px;
    padding: 20px;
    background: rgba(255, 253, 248, 0.9);
    border: 1px solid rgba(214, 205, 191, 0.9);
    border-radius: 24px;
    box-shadow: var(--shadow);
  }

  .chart__header {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    justify-content: space-between;
    align-items: flex-start;
  }

  .chart__eyebrow {
    margin: 0 0 6px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font: 600 0.72rem/1.2 "Helvetica Neue", Arial, sans-serif;
    color: var(--accent);
  }

  .chart__title {
    margin: 0;
    font-size: clamp(1.25rem, 2vw, 1.7rem);
    line-height: 1.1;
  }

  .chart__copy,
  .chart__selection {
    margin: 10px 0 0;
    color: var(--muted);
    font: 500 0.94rem/1.5 "Helvetica Neue", Arial, sans-serif;
  }

  .chart__meta {
    display: grid;
    gap: 10px;
    justify-items: start;
  }

  .chart__clear {
    display: inline-flex;
    align-items: center;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid rgba(157, 91, 59, 0.24);
    background: rgba(157, 91, 59, 0.12);
    text-decoration: none;
    font: 600 0.88rem/1 "Helvetica Neue", Arial, sans-serif;
  }

  .chart-scroll {
    margin-top: 18px;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 6px;
  }

  .chart-svg {
    display: block;
    min-width: 100%;
  }

  .chart__backdrop {
    fill: rgba(255, 255, 255, 0.84);
  }

  .chart__grid,
  .chart__baseline {
    stroke: rgba(111, 103, 95, 0.18);
    stroke-width: 1;
  }

  .chart__axis,
  .chart__label {
    fill: rgba(111, 103, 95, 0.92);
    font: 500 11px/1 "Helvetica Neue", Arial, sans-serif;
  }

  .chart__label--active {
    fill: var(--ink);
    font-weight: 700;
  }

  .chart-bar {
    fill: rgba(157, 91, 59, 0.4);
    transition: fill 120ms ease, opacity 120ms ease;
  }

  .chart-bar--active {
    fill: var(--accent);
  }

  .chart-bar--empty {
    fill: rgba(111, 103, 95, 0.18);
  }

  .chart__bucket {
    cursor: pointer;
  }

  .chart__bucket:hover .chart-bar,
  .chart__bucket:focus .chart-bar {
    fill: rgba(157, 91, 59, 0.65);
  }

  .chart__bucket--active .chart-bar,
  .chart__bucket--active:hover .chart-bar,
  .chart__bucket--active:focus .chart-bar {
    fill: var(--accent);
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

    .checkbox-fieldset {
      grid-column: span 2;
    }

    .checkbox-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
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

      ${renderForm(state, { action: "/feeds", resetHref: "/feeds", newestHref })}
      ${renderChartSection(input.chart, state, { basePath: "/feeds" })}
      ${renderSummarySection(state, input.events.length, input.hasMore)}
      ${renderTimelineSection({
        events: input.events,
        timelineHtml: renderTimelineItemsHtml(input.events),
        emptyMessage: "No events matched the current filters. Try widening the date range, switching category, or clearing product/model filters.",
        afterTimelineHtml: `${renderLoaderSection(input)}${renderNoscriptPagination(olderHref, newestHref)}`,
      })}
    </main>
    <script>${liveInlineScript}</script>
  </body>
</html>`;
};

export const renderStaticFeedsPage = (input: StaticFeedsPageInput) => {
  const state = input.state;
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
        <h1>LLM timeline</h1>
        <p>Exported ${formatUtcDate(input.exportedAt)}</p>
      </section>

      ${renderForm(state, { action: "./", resetHref: "./", formAttribute: 'data-feeds-form' })}
      ${renderChartSection(input.chart, state, { basePath: "./" })}
      ${renderSummarySection(state, input.events.length, input.hasMore)}
      <section
        class="timeline-shell"
        data-static-feeds
        data-data-href="${safeHref(input.dataHref)}"
        data-default-limit="${escapeHtml(String(state.limit))}"
        data-initial-count="${escapeHtml(String(input.events.length))}"
        data-initial-has-more="${input.hasMore ? "true" : "false"}"
      >
        <ol class="timeline" data-timeline${input.events.length ? "" : " hidden"}>${renderTimelineItemsHtml(input.events, {
          includeJsonLink: false,
        })}</ol>
        <p class="empty-state" data-empty-state${input.events.length ? " hidden" : ""}>No events matched the current filters. Try widening the date range, switching category, or clearing product/model filters.</p>
        <div class="feed-loader" data-static-loader hidden>
          <div class="feed-loader__controls">
            <button type="button" class="feed-loader__button" data-load-more>Load more</button>
            <p class="feed-loader__status" data-loader-status aria-live="polite">Loading snapshot...</p>
          </div>
          <div class="feed-loader__sentinel" data-loader-sentinel aria-hidden="true"></div>
        </div>
        <noscript>
          <p class="feed-loader__status">This static snapshot supports filtering and loading older pages with JavaScript enabled.</p>
        </noscript>
      </section>
    </main>
    <script>${renderStaticInlineScript()}</script>
  </body>
</html>`;
};
