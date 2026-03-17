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

const heatmapWeekdayLabels = ["Mon", "", "Wed", "", "Fri", "", ""];

const renderHeatmapCellsHtml = (chart: FeedsChartModel, state: FeedsPageState, basePath: string) =>
  chart.weeks
    .flatMap((week) =>
      week.cells.map((cell) => {
        const className = [
          "heatmap__cell",
          `heatmap__cell--level-${cell.level}`,
          !cell.inRange ? "heatmap__cell--void" : "",
          cell.active ? "heatmap__cell--active" : "",
        ]
          .filter(Boolean)
          .join(" ");

        if (!cell.inRange || cell.count <= 0) {
          return `<span class="${className}"${cell.inRange ? ` aria-label="${escapeHtml(cell.ariaLabel)}" title="${escapeHtml(cell.ariaLabel)}"` : ' aria-hidden="true"'}></span>`;
        }

        const href = buildPageHrefFor(basePath, state, {
          since: cell.day,
          until: cell.day,
          cursor: "",
        });
        return `<a href="${safeHref(href)}" class="${className}" data-chart-day="${escapeHtml(cell.day)}" aria-label="${escapeHtml(cell.ariaLabel)}" title="${escapeHtml(cell.ariaLabel)}"></a>`;
      })
    )
    .join("");

const renderChartSection = (
  chart: FeedsChartModel | null,
  state: FeedsPageState,
  options: { basePath: string }
) => {
  if (!chart || !chart.weeks.length) return "";
  const clearHref =
    state.since || state.until ? buildPageHrefFor(options.basePath, state, { since: "", until: "", cursor: "" }) : null;

  return `
      <section class="chart-shell" data-chart-root>
        <div class="chart__header">
          <div>
            <p class="chart__eyebrow">Heatmap</p>
            <h2 class="chart__title">Release activity by day</h2>
            <p class="chart__copy">Darker squares mark busier release days. Select a day to focus the timeline while keeping the full history visible.</p>
          </div>
          <div class="chart__meta">
            <p class="chart__selection">${escapeHtml(chart.selectionLabel ? `Focused: ${chart.selectionLabel}` : `Showing all ${chart.totalCount} events across the current non-date filters.`)}</p>
            ${clearHref ? `<a class="chart__clear" href="${safeHref(clearHref)}" data-chart-clear>Clear date focus</a>` : ""}
          </div>
        </div>
        <div class="chart-scroll" data-chart-scroll>
          <div class="heatmap" style="--heatmap-weeks:${chart.weeks.length}">
            <div class="heatmap__corner" aria-hidden="true"></div>
            <div class="heatmap__months">
              ${chart.monthLabels
                .map(
                  (label) =>
                    `<span class="heatmap__month" style="grid-column:${label.column + 1} / span 4">${escapeHtml(label.label)}</span>`
                )
                .join("")}
            </div>
            <div class="heatmap__weekdays" aria-hidden="true">
              ${heatmapWeekdayLabels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}
            </div>
            <div class="heatmap__grid" role="img" aria-label="GitHub-style day heatmap of event counts over time">
              ${renderHeatmapCellsHtml(chart, state, options.basePath)}
            </div>
            <div class="heatmap__legend" aria-hidden="true">
              <span>Less</span>
              <span class="heatmap__legend-cell heatmap__legend-cell--0"></span>
              <span class="heatmap__legend-cell heatmap__legend-cell--1"></span>
              <span class="heatmap__legend-cell heatmap__legend-cell--2"></span>
              <span class="heatmap__legend-cell heatmap__legend-cell--3"></span>
              <span class="heatmap__legend-cell heatmap__legend-cell--4"></span>
              <span>More</span>
            </div>
          </div>
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
  const chartScroll = document.querySelector("[data-chart-scroll]");
  const chartScrollStorageKey = "llm-timeline:heatmap-scroll-left";
  const pageScrollStorageKey = "llm-timeline:page-scroll-y";

  const restoreChartFocus = () => {
    try {
      const savedChartLeft = Number(sessionStorage.getItem(chartScrollStorageKey));
      const savedPageTop = Number(sessionStorage.getItem(pageScrollStorageKey));
      sessionStorage.removeItem(chartScrollStorageKey);
      sessionStorage.removeItem(pageScrollStorageKey);
      if (!Number.isFinite(savedChartLeft) && !Number.isFinite(savedPageTop)) {
        return;
      }
      requestAnimationFrame(() => {
        if (chartScroll instanceof HTMLElement && Number.isFinite(savedChartLeft)) {
          chartScroll.scrollLeft = savedChartLeft;
        }
        if (Number.isFinite(savedPageTop)) {
          window.scrollTo(0, savedPageTop);
        }
      });
    } catch {
      // Ignore storage failures and keep default browser behavior.
    }
  };

  const persistChartFocus = () => {
    try {
      if (chartScroll instanceof HTMLElement) {
        sessionStorage.setItem(chartScrollStorageKey, String(chartScroll.scrollLeft));
      }
      sessionStorage.setItem(pageScrollStorageKey, String(window.scrollY));
    } catch {
      // Ignore storage failures and keep default browser behavior.
    }
  };

  restoreChartFocus();

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-chart-day], [data-chart-clear]") : null;
    if (target instanceof HTMLAnchorElement) {
      persistChartFocus();
    }
  });

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
  const heatmapWeekdayLabels = ${JSON.stringify(heatmapWeekdayLabels)};
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

  const captureChartScrollState = () => {
    const currentChartScroll = chartRoot.querySelector("[data-chart-scroll]");
    if (!(currentChartScroll instanceof HTMLElement)) return null;
    return {
      left: currentChartScroll.scrollLeft,
      top: currentChartScroll.scrollTop,
    };
  };

  const restoreChartScrollState = (scrollState) => {
    if (!scrollState) return;
    requestAnimationFrame(() => {
      const nextChartScroll = chartRoot.querySelector("[data-chart-scroll]");
      if (!(nextChartScroll instanceof HTMLElement)) return;
      nextChartScroll.scrollLeft = scrollState.left;
      nextChartScroll.scrollTop = scrollState.top;
    });
  };

  const fullDayFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const shortMonthFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const shortYearFormatter = new Intl.DateTimeFormat("en-US", {
    year: "2-digit",
    timeZone: "UTC",
  });

  const escapeHtml = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

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

  const formatFullDay = (day) => fullDayFormatter.format(new Date(day + "T00:00:00.000Z"));

  const formatMonthAxisLabel = (day, previousYear) => {
    const date = new Date(day + "T00:00:00.000Z");
    const month = shortMonthFormatter.format(date);
    const year = shortYearFormatter.format(date);
    const yearKey = day.slice(0, 4);
    return previousYear === yearKey ? month : month + " '" + year;
  };

  const weekdayIndex = (value) => {
    const day = new Date(value).getUTCDay();
    return day === 0 ? 6 : day - 1;
  };

  const startOfWeek = (value) => value - weekdayIndex(value) * dayMs;

  const addDays = (value, days) => value + days * dayMs;

  const formatSelectionLabel = (sinceDay, untilDay) => {
    if (sinceDay && untilDay) {
      if (sinceDay === untilDay) return formatFullDay(sinceDay);
      return formatFullDay(sinceDay) + " to " + formatFullDay(untilDay);
    }
    if (sinceDay) return "From " + formatFullDay(sinceDay);
    if (untilDay) return "Through " + formatFullDay(untilDay);
    return "";
  };

  const levelForCount = (count, maxCount) => {
    if (count <= 0) return 0;
    if (maxCount <= 1) return 4;
    return Math.min(4, Math.max(1, Math.ceil((count / maxCount) * 4)));
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

    const countsByDay = new Map(dailyCounts.map((entry) => [entry.day, entry.count]));
    const firstDay = dailyCounts[0].day;
    const lastDay = dailyCounts[dailyCounts.length - 1].day;
    const firstGridMs = startOfWeek(parseDay(firstDay));
    const lastGridMs = addDays(startOfWeek(parseDay(lastDay)), 6);
    const selectedSince = toDayString(state.since);
    const selectedUntil = toDayString(state.until);
    const activeDay = selectedSince && selectedUntil && selectedSince === selectedUntil ? selectedSince : "";
    const totalCount = dailyCounts.reduce((sum, entry) => sum + entry.count, 0);
    const maxCount = Math.max.apply(null, dailyCounts.map((entry) => entry.count).concat([1]));
    const weeks = [];
    const monthLabels = [];
    let previousMonthKey = "";
    let previousYear = "";

    for (let weekStart = firstGridMs, weekIndex = 0; weekStart <= lastGridMs; weekStart += dayMs * 7, weekIndex += 1) {
      const cells = [];
      for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
        const currentMs = addDays(weekStart, dayOffset);
        const day = formatDayFromMs(currentMs);
        const inRange = day >= firstDay && day <= lastDay;
        const count = inRange ? countsByDay.get(day) || 0 : 0;
        const monthKey = day.slice(0, 7);

        if (inRange && monthKey !== previousMonthKey) {
          monthLabels.push({
            key: monthKey,
            label: formatMonthAxisLabel(day, previousYear || null),
            column: weekIndex,
          });
          previousMonthKey = monthKey;
          previousYear = day.slice(0, 4);
        }

        cells.push({
          day,
          count,
          level: inRange ? levelForCount(count, maxCount) : 0,
          active: activeDay === day,
          inRange,
          ariaLabel: formatFullDay(day) + ": " + count + " event" + (count === 1 ? "" : "s"),
        });
      }
      weeks.push({
        startDay: formatDayFromMs(weekStart),
        cells,
      });
    }

    return {
      weeks,
      monthLabels,
      totalCount,
      maxCount,
      selectionLabel: activeDay ? formatFullDay(activeDay) : formatSelectionLabel(selectedSince, selectedUntil),
    };
  };

  const buildChartHtml = (chart, state) => {
    if (!chart || !chart.weeks.length) return "";
    const clearHref = state.since || state.until ? "./?" + buildStateSearch({ ...state, since: "", until: "" }) : "";
    const cells = [];

    for (const week of chart.weeks) {
      for (const cell of week.cells) {
        const className = [
          "heatmap__cell",
          "heatmap__cell--level-" + cell.level,
          !cell.inRange ? "heatmap__cell--void" : "",
          cell.active ? "heatmap__cell--active" : "",
        ]
          .filter(Boolean)
          .join(" ");

        if (!cell.inRange || cell.count <= 0) {
          cells.push(
            '<span class="' +
              className +
              '"' +
              (cell.inRange
                ? ' aria-label="' + escapeHtml(cell.ariaLabel) + '" title="' + escapeHtml(cell.ariaLabel) + '"'
                : ' aria-hidden="true"') +
              "></span>"
          );
          continue;
        }

        cells.push(
          '<a href="./?' +
            escapeHtml(
              buildStateSearch({
                ...state,
                since: cell.day,
                until: cell.day,
              })
            ) +
            '" class="' +
            className +
            '" data-chart-day="' +
            escapeHtml(cell.day) +
            '" aria-label="' +
            escapeHtml(cell.ariaLabel) +
            '" title="' +
            escapeHtml(cell.ariaLabel) +
            '"></a>'
        );
      }
    }

    return [
      '<div class="chart__header">',
      "<div>",
      '<p class="chart__eyebrow">Heatmap</p>',
      '<h2 class="chart__title">Release activity by day</h2>',
      '<p class="chart__copy">Darker squares mark busier release days. Select a day to focus the timeline while keeping the full history visible.</p>',
      "</div>",
      '<div class="chart__meta">',
      '<p class="chart__selection">' +
        (chart.selectionLabel
          ? "Focused: " + escapeHtml(chart.selectionLabel)
          : "Showing all " + chart.totalCount + " events across the current non-date filters.") +
        "</p>",
      clearHref ? '<a class="chart__clear" href="' + escapeHtml(clearHref) + '" data-chart-clear>Clear date focus</a>' : "",
      "</div>",
      "</div>",
      '<div class="chart-scroll" data-chart-scroll>',
      '<div class="heatmap" style="--heatmap-weeks:' + chart.weeks.length + '">',
      '<div class="heatmap__corner" aria-hidden="true"></div>',
      '<div class="heatmap__months">',
      chart.monthLabels
        .map((label) => {
          return (
            '<span class="heatmap__month" style="grid-column:' +
            (label.column + 1) +
            ' / span 4">' +
            escapeHtml(label.label) +
            "</span>"
          );
        })
        .join(""),
      "</div>",
      '<div class="heatmap__weekdays" aria-hidden="true">',
      heatmapWeekdayLabels.map((label) => "<span>" + escapeHtml(label) + "</span>").join(""),
      "</div>",
      '<div class="heatmap__grid" role="img" aria-label="GitHub-style day heatmap of event counts over time">',
      cells.join(""),
      "</div>",
      '<div class="heatmap__legend" aria-hidden="true"><span>Less</span><span class="heatmap__legend-cell heatmap__legend-cell--0"></span><span class="heatmap__legend-cell heatmap__legend-cell--1"></span><span class="heatmap__legend-cell heatmap__legend-cell--2"></span><span class="heatmap__legend-cell heatmap__legend-cell--3"></span><span class="heatmap__legend-cell heatmap__legend-cell--4"></span><span>More</span></div>',
      "</div>",
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
      setStatus("You have reached the end of the timeline.");
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

  const renderChart = (scrollState) => {
    if (!allEvents) return;
    const chart = buildChartModel(baseFilteredEvents, currentState);
    if (!chart) {
      chartRoot.hidden = true;
      chartRoot.innerHTML = "";
      return;
    }
    chartRoot.hidden = false;
    chartRoot.innerHTML = buildChartHtml(chart, currentState);
    restoreChartScrollState(scrollState);
  };

  const applyState = (state, pushHistory, options = {}) => {
    const scrollState = options.preserveChartScroll ? captureChartScrollState() : null;
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
    renderChart(scrollState);
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
    const target = event.target instanceof Element ? event.target.closest("[data-chart-day], [data-chart-clear]") : null;
    if (!(target instanceof HTMLAnchorElement)) return;
    event.preventDefault();
    if (target.hasAttribute("data-chart-clear")) {
      applyState({ ...currentState, since: "", until: "" }, true, { preserveChartScroll: true });
      return;
    }
    const day = target.dataset.chartDay || "";
    applyState(
      {
        ...currentState,
        since: day,
        until: day,
      },
      true,
      { preserveChartScroll: true }
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
      setStatus("Could not load the static snapshot data.");
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

  *,
  *::before,
  *::after {
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

  .heatmap {
    --heatmap-cell: 13px;
    display: grid;
    grid-template-columns: auto max-content;
    grid-template-rows: auto auto auto;
    gap: 8px 10px;
    align-items: start;
    min-width: max-content;
  }

  .heatmap__corner {
    min-height: 18px;
  }

  .heatmap__months {
    display: grid;
    grid-template-columns: repeat(var(--heatmap-weeks), var(--heatmap-cell));
    gap: 4px;
    min-height: 18px;
    align-items: end;
  }

  .heatmap__month {
    color: rgba(111, 103, 95, 0.92);
    font: 600 11px/1 "Helvetica Neue", Arial, sans-serif;
    white-space: nowrap;
  }

  .heatmap__weekdays {
    display: grid;
    grid-template-rows: repeat(7, var(--heatmap-cell));
    gap: 4px;
  }

  .heatmap__weekdays span {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-height: var(--heatmap-cell);
    color: rgba(111, 103, 95, 0.92);
    font: 500 11px/1 "Helvetica Neue", Arial, sans-serif;
  }

  .heatmap__grid {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: var(--heatmap-cell);
    grid-template-rows: repeat(7, var(--heatmap-cell));
    gap: 4px;
    min-width: max-content;
  }

  .heatmap__cell {
    display: block;
    width: var(--heatmap-cell);
    height: var(--heatmap-cell);
    border-radius: 3px;
    border: 1px solid transparent;
    transition: transform 120ms ease, background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
  }

  .heatmap__cell--void {
    visibility: hidden;
  }

  .heatmap__cell--level-0 {
    background: rgba(111, 103, 95, 0.12);
    border-color: rgba(111, 103, 95, 0.08);
  }

  .heatmap__cell--level-1 {
    background: #eadbca;
    border-color: #dfccb9;
  }

  .heatmap__cell--level-2 {
    background: #d6b08d;
    border-color: #cb9a74;
  }

  .heatmap__cell--level-3 {
    background: #c77c50;
    border-color: #b96d43;
  }

  .heatmap__cell--level-4 {
    background: #9d5b3b;
    border-color: #8e4f31;
  }

  a.heatmap__cell {
    cursor: pointer;
  }

  a.heatmap__cell:hover,
  a.heatmap__cell:focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 0 0 2px rgba(157, 91, 59, 0.22);
    outline: 0;
  }

  .heatmap__cell--active {
    border-color: rgba(31, 26, 22, 0.88);
    box-shadow: 0 0 0 2px rgba(31, 26, 22, 0.22);
  }

  .heatmap__legend {
    grid-column: 2;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: rgba(111, 103, 95, 0.92);
    font: 500 0.76rem/1 "Helvetica Neue", Arial, sans-serif;
  }

  .heatmap__legend-cell {
    display: inline-block;
    width: var(--heatmap-cell);
    height: var(--heatmap-cell);
    border-radius: 3px;
    border: 1px solid transparent;
  }

  .heatmap__legend-cell--0 {
    background: rgba(111, 103, 95, 0.12);
    border-color: rgba(111, 103, 95, 0.08);
  }

  .heatmap__legend-cell--1 {
    background: #eadbca;
    border-color: #dfccb9;
  }

  .heatmap__legend-cell--2 {
    background: #d6b08d;
    border-color: #cb9a74;
  }

  .heatmap__legend-cell--3 {
    background: #c77c50;
    border-color: #b96d43;
  }

  .heatmap__legend-cell--4 {
    background: #9d5b3b;
    border-color: #8e4f31;
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
    --timeline-axis-left: 20px;
    --timeline-axis-width: 2px;
    --timeline-marker-size: 18px;
    --timeline-marker-top: 20px;
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
    left: var(--timeline-axis-left);
    width: var(--timeline-axis-width);
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
    left: calc(var(--timeline-axis-left) + (var(--timeline-axis-width) / 2) - (var(--timeline-marker-size) / 2));
    top: var(--timeline-marker-top);
    width: var(--timeline-marker-size);
    height: var(--timeline-marker-size);
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

    .heatmap {
      --heatmap-cell: 14px;
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

    .timeline {
      --timeline-axis-left: 130px;
    }

    .timeline__item {
      grid-template-columns: 100px minmax(0, 1fr);
      gap: 24px;
      padding: 12px 0 22px;
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
        <div class="hero__links">
          <a href="https://github.com/atjsh/llm-timeline" target="_blank" rel="noreferrer">GitHub (source code)</a>
        </div>
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
