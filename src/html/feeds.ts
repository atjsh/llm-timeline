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

export interface StaticFeedsSourceSummary {
  id: string;
  vendor: Vendor;
  name: string;
  url: string;
  description?: string;
}

export interface StaticFeedsPageInput {
  events: EventRow[];
  hasMore: boolean;
  state: FeedsPageState;
  chart: FeedsChartModel | null;
  dataHref: string;
  exportedAt: string;
  sources: StaticFeedsSourceSummary[];
}

const pageTitle = "LLM API 타임라인";
const htmlLang = "ko";

const vendorLabels: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
};

const categoryLabels: Record<EventCategory, string> = {
  model_release: "모델 출시",
  model_rollout: "모델 배포",
  deprecation: "지원 종료",
  release_note: "릴리스 노트",
  tech_guide: "기술 가이드",
  blog_update: "블로그 업데이트",
};

const dateKindLabels: Record<EventDateKind, string> = {
  published: "게시일",
  effective: "적용일",
  rollout: "배포일",
  deprecation: "지원 종료일",
  release: "출시일",
};

const ui = {
  all: "전체",
  liveHeroEyebrow: "SQLite 미리보기",
  liveHeroCopy:
    "정규화된 events 테이블에서 여러 LLM 공급자의 이벤트를 모아 보여줍니다. 필터를 사용해 Hono 서버 안에서 출시, 배포, 릴리스 노트, 지원 종료를 바로 살펴볼 수 있습니다.",
  currentJson: "현재 JSON",
  currentIcs: "현재 ICS",
  sourceStatus: "소스 상태",
  source: "원문",
  json: "JSON",
  vendor: "벤더",
  category: "카테고리",
  product: "제품",
  model: "모델",
  since: "시작일",
  until: "종료일",
  perPage: "페이지당",
  applyFilters: "필터 적용",
  reset: "초기화",
  newest: "최신",
  older: "이전",
  chartEyebrow: "히트맵",
  chartTitle: "날짜별 릴리스 활동",
  chartCopy:
    "진한 칸일수록 해당 날짜의 이벤트가 많습니다. 날짜를 선택하면 전체 기록은 그대로 둔 채 타임라인을 그 날짜에 맞춰 좁힙니다.",
  clearDateFocus: "날짜 선택 해제",
  chartAriaLabel: "시간에 따른 이벤트 수를 보여주는 GitHub 스타일 일별 히트맵",
  less: "적음",
  more: "많음",
  loadMore: "더 보기",
  untitled: "제목 없음",
  noSummary: "요약이 없습니다.",
  staticRepoLink: "GitHub (소스 코드)",
  staticHowItWorksHtml:
    'Node.js 스크립트가 RSS/Atom 피드, GitHub 릴리스, HTML 변경 로그 페이지, Anthropic 사이트맵 크롤링에서 데이터를 수집합니다. 각 항목은 SQLite에 저장된 뒤 정적 HTML 페이지와 <code>events.json</code>으로 내보내지며, 브라우저가 그 파일로 히트맵, 필터, 타임라인을 렌더링합니다.',
  staticSnapshotJavascript:
    "이 정적 스냅샷은 JavaScript를 켜면 필터와 더 보기 기능을 사용할 수 있습니다.",
} as const;

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

const renderSummaryHeading = (count: number, hasMore: boolean) =>
  `이벤트 ${count}개를 표시합니다${hasMore ? ". 이전 페이지가 더 있습니다." : "."}`;

const renderChartSelectionText = (chart: FeedsChartModel) =>
  chart.selectionLabel
    ? `선택됨: ${chart.selectionLabel}`
    : `현재 날짜 필터를 제외한 조건에서 이벤트 ${chart.totalCount}개를 표시하고 있습니다.`;

const renderSourceSummaryLabel = (count: number) => `이 스냅샷에 사용된 소스 (${count})`;

const localizedCategoryLabel = (value: EventCategory) => categoryLabels[value] ?? humanizeToken(value);

const localizedDateKindLabel = (value: EventDateKind) => dateKindLabels[value] ?? humanizeToken(value);

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

const formatEventDateKind = (value: EventRow["event_date_kind"]) => localizedDateKindLabel(value);

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
      chips.push({ label: ui.vendor, value: vendorLabels[vendor] ?? humanizeToken(vendor) });
    }
  } else {
    chips.push({ label: ui.vendor, value: ui.all });
  }
  if (state.categories.length) {
    for (const category of state.categories) {
      chips.push({ label: ui.category, value: localizedCategoryLabel(category) });
    }
  } else {
    chips.push({ label: ui.category, value: ui.all });
  }
  if (state.product) chips.push({ label: ui.product, value: state.product });
  if (state.model) chips.push({ label: ui.model, value: state.model });
  if (state.since) chips.push({ label: ui.since, value: state.since });
  if (state.until) chips.push({ label: ui.until, value: state.until });
  chips.push({ label: ui.perPage, value: String(state.limit) });
  return chips;
};

const renderTimelineItemHtml = (event: EventRow, options: { includeJsonLink?: boolean } = {}) => {
  const includeJsonLink = options.includeJsonLink !== false;
  const summary = renderSummaryText(event);
  const vendorLabel = vendorLabels[event.vendor] ?? humanizeToken(event.vendor);
  const categoryLabel = localizedCategoryLabel(event.category);
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
        <h2 class="event-card__title">${escapeHtml(event.title || ui.untitled)}</h2>
        <p class="event-card__summary">${escapeHtml(summary || ui.noSummary)}</p>
        ${
          products.length || models.length
            ? `<p class="event-card__meta">${
                products.length ? `${ui.product}: ${escapeHtml(products.join(", "))}` : ""
              }${products.length && models.length ? " · " : ""}${models.length ? `${ui.model}: ${escapeHtml(models.join(", "))}` : ""}</p>`
            : ""
        }
        <div class="event-card__links">
          <a href="${sourceHref}" target="_blank" rel="noreferrer">${ui.source}</a>
          ${jsonHref ? `<a href="${jsonHref}" target="_blank" rel="noreferrer">${ui.json}</a>` : ""}
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

const renderStaticSourceList = (sources: StaticFeedsSourceSummary[]) => {
  if (!sources.length) return "";

  return `
        <details class="hero__sources">
          <summary>${renderSourceSummaryLabel(sources.length)}</summary>
          <ul class="hero__sources-list">
            ${sources
              .map((source) => {
                const vendorLabel = vendorLabels[source.vendor] ?? humanizeToken(source.vendor);
                return `
              <li class="hero__sources-item">
                <p class="hero__sources-title"><strong>${escapeHtml(source.name)}</strong> <span>${escapeHtml(vendorLabel)}</span></p>
                <p class="hero__sources-link"><a href="${safeHref(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.url)}</a></p>
                ${source.description ? `<p class="hero__sources-description">${escapeHtml(source.description)}</p>` : ""}
              </li>
                `;
              })
              .join("")}
          </ul>
        </details>
  `;
};

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
    label: localizedCategoryLabel(category),
  }));

  return `
      <section class="controls">
        <form method="get" action="${safeHref(options.action)}"${options.formAttribute ? ` ${options.formAttribute}` : ""}>
          <div class="controls__grid">
            <fieldset class="checkbox-fieldset">
              <legend class="checkbox-fieldset__legend">${ui.vendor}</legend>
              <input type="hidden" name="vendor" value="all" />
              <div class="checkbox-grid">
                ${renderCheckboxOptions("vendor", vendorOptions, state.vendors)}
              </div>
            </fieldset>
            <fieldset class="checkbox-fieldset">
              <legend class="checkbox-fieldset__legend">${ui.category}</legend>
              <input type="hidden" name="category" value="all" />
              <div class="checkbox-grid">
                ${renderCheckboxOptions("category", categoryOptions, state.categories)}
              </div>
            </fieldset>
            <label>
              ${ui.product}
              <input type="text" name="product" value="${escapeHtml(state.product)}" placeholder="예: chatgpt" />
            </label>
            <label>
              ${ui.model}
              <input type="text" name="model" value="${escapeHtml(state.model)}" placeholder="예: claude-opus-4.6" />
            </label>
            <label>
              ${ui.since}
              <input type="date" name="since" value="${escapeHtml(state.since)}" />
            </label>
            <label>
              ${ui.until}
              <input type="date" name="until" value="${escapeHtml(state.until)}" />
            </label>
            <label>
              ${ui.perPage}
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
            <button type="submit">${ui.applyFilters}</button>
            <a href="${safeHref(options.resetHref)}" data-reset-link>${ui.reset}</a>
            ${options.newestHref ? `<a href="${safeHref(options.newestHref)}">${ui.newest}</a>` : ""}
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

const heatmapWeekdayLabels = ["월", "", "수", "", "금", "", ""];

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
            <p class="chart__eyebrow">${ui.chartEyebrow}</p>
            <h2 class="chart__title">${ui.chartTitle}</h2>
            <p class="chart__copy">${ui.chartCopy}</p>
          </div>
          <div class="chart__meta">
            <p class="chart__selection">${escapeHtml(renderChartSelectionText(chart))}</p>
            ${clearHref ? `<a class="chart__clear" href="${safeHref(clearHref)}" data-chart-clear>${ui.clearDateFocus}</a>` : ""}
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
            <div class="heatmap__grid" role="img" aria-label="${ui.chartAriaLabel}">
              ${renderHeatmapCellsHtml(chart, state, options.basePath)}
            </div>
            <div class="heatmap__legend" aria-hidden="true">
              <span>${ui.less}</span>
              <span class="heatmap__legend-cell heatmap__legend-cell--0"></span>
              <span class="heatmap__legend-cell heatmap__legend-cell--1"></span>
              <span class="heatmap__legend-cell heatmap__legend-cell--2"></span>
              <span class="heatmap__legend-cell heatmap__legend-cell--3"></span>
              <span class="heatmap__legend-cell heatmap__legend-cell--4"></span>
              <span>${ui.more}</span>
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
            ${newestHref ? `<a href="${safeHref(newestHref)}">${ui.newest}</a>` : ""}
            ${olderHref ? `<a href="${safeHref(olderHref)}">${ui.older}</a>` : ""}
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
            <button type="button" class="feed-loader__button" data-load-more>${ui.loadMore}</button>
            <p class="feed-loader__status" data-loader-status aria-live="polite">아래로 스크롤하거나 '${ui.loadMore}'를 눌러 이전 이벤트를 불러오세요.</p>
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
  const locale = ${JSON.stringify({
    loadMore: ui.loadMore,
    loaderEnd: "타임라인의 끝까지 도달했습니다.",
    loaderLoadingManual: "이벤트를 더 불러오는 중...",
    loaderLoadingAuto: "이전 이벤트를 불러오는 중...",
    loaderLoadedMore: "이벤트를 더 불러왔습니다.",
    loaderLoadError: "이전 이벤트를 불러오지 못했습니다. '더 보기'를 눌러 다시 시도하세요.",
    loaderTapMore: "'더 보기'를 눌러 이전 이벤트를 계속 살펴보세요.",
  })};

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
    return "이벤트 " + count + "개를 표시합니다" + (more ? ". 이전 페이지가 더 있습니다." : ".");
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
      setStatus(locale.loaderEnd);
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
    setStatus(trigger === "manual" ? locale.loaderLoadingManual : locale.loaderLoadingAuto);

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
      setStatus(hasMore ? locale.loaderLoadedMore : locale.loaderEnd);
    } catch {
      setStatus(locale.loaderLoadError);
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
    setStatus(locale.loaderTapMore);
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
  const categoryLabels = ${JSON.stringify(categoryLabels)};
  const heatmapWeekdayLabels = ${JSON.stringify(heatmapWeekdayLabels)};
  const locale = ${JSON.stringify({
    all: ui.all,
    vendor: ui.vendor,
    category: ui.category,
    product: ui.product,
    model: ui.model,
    since: ui.since,
    until: ui.until,
    perPage: ui.perPage,
    chartEyebrow: ui.chartEyebrow,
    chartTitle: ui.chartTitle,
    chartCopy: ui.chartCopy,
    clearDateFocus: ui.clearDateFocus,
    chartAriaLabel: ui.chartAriaLabel,
    less: ui.less,
    more: ui.more,
    loadMore: ui.loadMore,
    summaryPrefix: "이벤트 ",
    summarySuffix: "개를 표시합니다",
    summaryMore: ". 이전 페이지가 더 있습니다.",
    chartFocused: "선택됨: ",
    chartAllPrefix: "현재 날짜 필터를 제외한 조건에서 이벤트 ",
    chartAllSuffix: "개를 표시하고 있습니다.",
    loaderNoMatch: "현재 필터와 일치하는 이벤트가 없습니다.",
    loaderEnd: "타임라인의 끝까지 도달했습니다.",
    loaderScroll: `아래로 스크롤하거나 '${ui.loadMore}'를 눌러 이전 이벤트를 불러오세요.`,
    loaderLoadingManual: "이벤트를 더 불러오는 중...",
    loaderLoadingAuto: "이전 이벤트를 불러오는 중...",
    staticLoadingSnapshot: "스냅샷을 불러오는 중...",
    staticSnapshotError: "정적 스냅샷 데이터를 불러오지 못했습니다.",
  })};
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

  const fullDayFormatter = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const shortMonthFormatter = new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    timeZone: "UTC",
  });
  const yearFormatter = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
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

  const localizedCategoryLabel = (value) => categoryLabels[value] || humanizeToken(value);

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
    const yearKey = day.slice(0, 4);
    return previousYear === yearKey ? month : yearFormatter.format(date) + " " + month;
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
      return formatFullDay(sinceDay) + " ~ " + formatFullDay(untilDay);
    }
    if (sinceDay) return formatFullDay(sinceDay) + "부터";
    if (untilDay) return formatFullDay(untilDay) + "까지";
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
    return locale.summaryPrefix + count + locale.summarySuffix + (hasMore ? locale.summaryMore : ".");
  };

  const setStatus = (message) => {
    status.textContent = message;
  };

  const setChips = (state) => {
    chips.textContent = "";
    const values = [];
    if (state.vendors.length) {
      for (const vendor of state.vendors) {
        values.push({ label: locale.vendor, value: vendorLabels[vendor] || humanizeToken(vendor) });
      }
    } else {
      values.push({ label: locale.vendor, value: locale.all });
    }
    if (state.categories.length) {
      for (const category of state.categories) {
        values.push({ label: locale.category, value: localizedCategoryLabel(category) });
      }
    } else {
      values.push({ label: locale.category, value: locale.all });
    }
    if (state.product) values.push({ label: locale.product, value: state.product });
    if (state.model) values.push({ label: locale.model, value: state.model });
    if (state.since) values.push({ label: locale.since, value: state.since });
    if (state.until) values.push({ label: locale.until, value: state.until });
    values.push({ label: locale.perPage, value: String(state.limit) });

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
          ariaLabel: formatFullDay(day) + ": 이벤트 " + count + "개",
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
      '<p class="chart__eyebrow">' + escapeHtml(locale.chartEyebrow) + '</p>',
      '<h2 class="chart__title">' + escapeHtml(locale.chartTitle) + '</h2>',
      '<p class="chart__copy">' + escapeHtml(locale.chartCopy) + '</p>',
      "</div>",
      '<div class="chart__meta">',
      '<p class="chart__selection">' +
        (chart.selectionLabel
          ? escapeHtml(locale.chartFocused + chart.selectionLabel)
          : escapeHtml(locale.chartAllPrefix + chart.totalCount + locale.chartAllSuffix)) +
        "</p>",
      clearHref ? '<a class="chart__clear" href="' + escapeHtml(clearHref) + '" data-chart-clear>' + escapeHtml(locale.clearDateFocus) + '</a>' : "",
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
      '<div class="heatmap__grid" role="img" aria-label="' + escapeHtml(locale.chartAriaLabel) + '">',
      cells.join(""),
      "</div>",
      '<div class="heatmap__legend" aria-hidden="true"><span>' + escapeHtml(locale.less) + '</span><span class="heatmap__legend-cell heatmap__legend-cell--0"></span><span class="heatmap__legend-cell heatmap__legend-cell--1"></span><span class="heatmap__legend-cell heatmap__legend-cell--2"></span><span class="heatmap__legend-cell heatmap__legend-cell--3"></span><span class="heatmap__legend-cell heatmap__legend-cell--4"></span><span>' + escapeHtml(locale.more) + '</span></div>',
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
      setStatus(locale.loaderNoMatch);
      return;
    }
    if (!loading && !hasMore && allEvents !== null) {
      setStatus(locale.loaderEnd);
      return;
    }
    if (!loading && hasMore) {
      setStatus(locale.loaderScroll);
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
    setStatus(trigger === "manual" ? locale.loaderLoadingManual : locale.loaderLoadingAuto);
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
  setStatus(locale.staticLoadingSnapshot);

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
      setStatus(locale.staticSnapshotError);
      button.hidden = true;
      sentinel.hidden = true;
    });
})();
`;

const styles = `
  :root {
    color-scheme: light;
    --font-sans: -apple-system, BlinkMacSystemFont, avenir next, avenir, segoe ui, helvetica neue, helvetica, Cantarell, Ubuntu, roboto, noto, arial, sans-serif;
    --bg: #f4f1eb;
    --surface: #f8f4ee;
    --surface-strong: #fcfaf6;
    --surface-muted: #efe8de;
    --ink: #1f1a16;
    --muted: #645d55;
    --line: #d9cfbf;
    --line-strong: #c8baa4;
    --accent: #8b5a42;
    --openai: #0f766e;
    --openai-tint: rgba(15, 118, 110, 0.12);
    --anthropic: #9a3412;
    --anthropic-tint: rgba(154, 52, 18, 0.12);
    --google: #1d4ed8;
    --google-tint: rgba(29, 78, 216, 0.1);
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, avenir next, avenir, segoe ui, helvetica neue, helvetica, Cantarell, Ubuntu, roboto, noto, arial, sans-serif;
    background: var(--bg);
    color: var(--ink);
    line-height: 1.5;
  }

  a {
    color: inherit;
  }

  input,
  select,
  button {
    font: inherit;
  }

  a:focus-visible,
  button:focus-visible,
  input:focus-visible,
  select:focus-visible,
  summary:focus-visible,
  .checkbox-option:focus-within {
    outline: 2px solid rgba(139, 90, 66, 0.35);
    outline-offset: 2px;
  }

  .page {
    max-width: 1040px;
    margin: 0 auto;
    padding: 24px 16px 56px;
  }

  .hero,
  .controls,
  .chart-shell,
  .summary,
  .timeline-shell {
    margin-top: 16px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 16px;
  }

  .hero {
    padding: 24px;
    background: var(--surface-strong);
  }

  .hero__eyebrow {
    margin: 0 0 8px;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.74rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .hero h1 {
    margin: 0;
    font-size: clamp(2rem, 4vw, 3.3rem);
    line-height: 0.98;
    letter-spacing: -0.03em;
  }

  .hero p {
    margin: 14px 0 0;
    max-width: 52rem;
    color: var(--muted);
    font-size: 1rem;
    line-height: 1.65;
  }

  .hero code {
    display: inline-block;
    border-radius: 8px;
    padding: 2px 7px;
    background: var(--surface-muted);
    color: var(--ink);
    font-family: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size: 0.88rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .hero__links {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 18px;
  }

  .hero__sources {
    margin-top: 18px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.32);
    overflow: hidden;
  }

  .hero__sources summary {
    cursor: pointer;
    list-style: none;
    padding: 14px 16px;
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.4;
  }

  .hero__sources summary::-webkit-details-marker {
    display: none;
  }

  .hero__sources-list {
    list-style: none;
    margin: 0;
    padding: 0 16px 16px;
    display: grid;
    gap: 14px;
  }

  .hero__sources-item {
    padding-top: 14px;
    border-top: 1px solid rgba(217, 207, 191, 0.85);
  }

  .hero__sources-item:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .hero__sources-title,
  .hero__sources-link,
  .hero__sources-description {
    margin: 0;
    max-width: none;
    color: var(--muted);
    font-size: 0.94rem;
    line-height: 1.55;
  }

  .hero__sources-title {
    color: var(--ink);
  }

  .hero__sources-title span {
    color: var(--muted);
    font-weight: 500;
  }

  .hero__sources-link {
    margin-top: 4px;
  }

  .hero__sources-link a,
  .event-card__links a {
    display: inline;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
    text-decoration: underline;
    text-underline-offset: 0.18em;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .hero__sources-description {
    margin-top: 4px;
  }

  .hero__links a,
  .controls__actions a,
  .controls__actions button,
  .pagination a,
  .feed-loader__button,
  .chart__clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 40px;
    padding: 0 14px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--surface-strong);
    color: inherit;
    text-decoration: none;
    font-size: 0.92rem;
    font-weight: 600;
    line-height: 1.2;
    transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
  }

  .hero__links a:hover,
  .controls__actions a:hover,
  .pagination a:hover,
  .feed-loader__button:hover,
  .chart__clear:hover {
    background: var(--surface-muted);
    border-color: var(--line-strong);
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
    min-width: 0;
    color: var(--muted);
    font-size: 0.84rem;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0.01em;
  }

  .controls input,
  .controls select {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 44px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--surface-strong);
    padding: 0 14px;
    color: var(--ink);
    font-size: 0.96rem;
    font-weight: 500;
    line-height: 1.2;
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
    color: var(--muted);
    font-size: 0.84rem;
    font-weight: 700;
    line-height: 1.2;
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
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--surface-strong);
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
    font-size: 0.94rem;
    font-weight: 500;
    line-height: 1.3;
  }

  .controls__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 16px;
  }

  .controls__actions button {
    border-color: var(--ink);
    background: var(--ink);
    color: #fff;
    cursor: pointer;
  }

  .controls__actions button:hover {
    background: #2d2621;
    border-color: #2d2621;
  }

  .chart-shell {
    padding: 20px;
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
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .chart__title {
    margin: 0;
    font-size: clamp(1.25rem, 2vw, 1.65rem);
    line-height: 1.1;
  }

  .chart__copy,
  .chart__selection {
    margin: 10px 0 0;
    color: var(--muted);
    font-size: 0.94rem;
    font-weight: 500;
    line-height: 1.55;
  }

  .chart__meta {
    display: grid;
    gap: 10px;
    justify-items: start;
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
    color: rgba(100, 93, 85, 0.92);
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
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
    color: rgba(100, 93, 85, 0.92);
    font-size: 11px;
    font-weight: 500;
    line-height: 1;
  }

  .heatmap__grid {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: var(--heatmap-cell);
    grid-template-rows: repeat(7, var(--heatmap-cell));
    gap: 4px;
    min-width: max-content;
  }

  .heatmap__cell,
  .heatmap__legend-cell {
    display: block;
    width: var(--heatmap-cell);
    height: var(--heatmap-cell);
    border-radius: 2px;
    border: 1px solid transparent;
  }

  .heatmap__cell {
    transition: background-color 120ms ease, border-color 120ms ease;
  }

  .heatmap__cell--void {
    visibility: hidden;
  }

  .heatmap__cell--level-0,
  .heatmap__legend-cell--0 {
    background: rgba(100, 93, 85, 0.1);
    border-color: rgba(100, 93, 85, 0.08);
  }

  .heatmap__cell--level-1,
  .heatmap__legend-cell--1 {
    background: #e7ddd0;
    border-color: #ddd0c1;
  }

  .heatmap__cell--level-2,
  .heatmap__legend-cell--2 {
    background: #d8bfa5;
    border-color: #ccb091;
  }

  .heatmap__cell--level-3,
  .heatmap__legend-cell--3 {
    background: #c58b67;
    border-color: #b77c59;
  }

  .heatmap__cell--level-4,
  .heatmap__legend-cell--4 {
    background: #9d5b3b;
    border-color: #8f5134;
  }

  a.heatmap__cell {
    cursor: pointer;
  }

  a.heatmap__cell:hover,
  a.heatmap__cell:focus-visible {
    background-color: #b7724d;
    border-color: #a66442;
    outline: 0;
  }

  .heatmap__cell--active {
    border-color: rgba(31, 26, 22, 0.9);
  }

  .heatmap__legend {
    grid-column: 2;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: rgba(100, 93, 85, 0.92);
    font-size: 0.76rem;
    font-weight: 500;
    line-height: 1;
  }

  .summary {
    padding: 18px 20px;
  }

  .summary__heading {
    margin: 0 0 10px;
    font-size: 0.98rem;
    font-weight: 700;
    line-height: 1.4;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip {
    display: inline-flex;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.28);
    color: var(--ink);
    font-size: 0.84rem;
    font-weight: 500;
    line-height: 1.2;
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
    --timeline-axis-width: 1px;
    --timeline-marker-size: 14px;
    --timeline-marker-top: 22px;
    --timeline-date-width: 132px;
    --timeline-gutter-width: 56px;
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
    background: rgba(139, 90, 66, 0.2);
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
    background: var(--surface-strong);
    border: 2px solid rgba(139, 90, 66, 0.72);
  }

  .timeline__date {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .timeline__day {
    font-size: 0.96rem;
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
    word-break: keep-all;
  }

  .timeline__kind {
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 600;
    line-height: 1.2;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
    word-break: keep-all;
  }

  .event-card {
    min-width: 0;
    padding: 16px;
    border-radius: 14px;
    border: 1px solid rgba(217, 207, 191, 0.95);
    background: rgba(255, 255, 255, 0.24);
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
    min-height: 26px;
    padding: 0 8px;
    border-radius: 8px;
    border: 1px solid transparent;
    font-size: 0.78rem;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: 0.01em;
  }

  .badge--vendor {
    color: var(--ink);
  }

  .badge--openai {
    border-color: rgba(15, 118, 110, 0.2);
    background: var(--openai-tint);
    color: var(--openai);
  }

  .badge--anthropic {
    border-color: rgba(154, 52, 18, 0.2);
    background: var(--anthropic-tint);
    color: var(--anthropic);
  }

  .badge--google {
    border-color: rgba(29, 78, 216, 0.18);
    background: var(--google-tint);
    color: var(--google);
  }

  .badge--category {
    border-color: var(--line);
    background: rgba(255, 255, 255, 0.22);
    color: var(--muted);
  }

  .event-card__title {
    margin: 12px 0 10px;
    font-size: clamp(1.08rem, 2vw, 1.34rem);
    line-height: 1.25;
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
    font-size: 0.9rem;
    font-weight: 500;
    line-height: 1.5;
  }

  .event-card__links {
    margin-top: 14px;
    font-size: 0.84rem;
    font-weight: 700;
    line-height: 1.2;
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
  }

  .feed-loader__button[disabled] {
    opacity: 0.6;
    cursor: progress;
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
      --timeline-axis-left: calc(var(--timeline-date-width) + (var(--timeline-gutter-width) / 2) - (var(--timeline-axis-width) / 2));
    }

    .timeline__item {
      grid-template-columns: var(--timeline-date-width) var(--timeline-gutter-width) minmax(0, 1fr);
      gap: 0;
      padding: 12px 0 22px;
    }

    .timeline__date {
      grid-column: 1;
      padding-top: 8px;
      text-align: right;
    }

    .event-card {
      grid-column: 3;
    }
  }
`;

export const renderFeedsPage = (input: FeedsPageInput) => {
  const state = input.state;
  const olderHref = input.nextCursor ? buildPageHref(state, { cursor: input.nextCursor }) : null;
  const newestHref = state.cursor ? buildPageHref(state, { cursor: "" }) : null;

  return `<!DOCTYPE html>
<html lang="${htmlLang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${pageTitle}</title>
    <style>${styles}</style>
  </head>
  <body>
    <main class="page">
      <section class="hero">
        <p class="hero__eyebrow">${ui.liveHeroEyebrow}</p>
        <h1>${pageTitle}</h1>
        <p>${ui.liveHeroCopy}</p>
        <div class="hero__links">
          <a href="${safeHref(input.eventsJsonHref)}" target="_blank" rel="noreferrer">${ui.currentJson}</a>
          <a href="${safeHref(input.calendarHref)}" target="_blank" rel="noreferrer">${ui.currentIcs}</a>
          <a href="${safeHref(input.sourcesHref)}" target="_blank" rel="noreferrer">${ui.sourceStatus}</a>
        </div>
      </section>

      ${renderForm(state, { action: "/feeds", resetHref: "/feeds", newestHref })}
      ${renderChartSection(input.chart, state, { basePath: "/feeds" })}
      ${renderSummarySection(state, input.events.length, input.hasMore)}
      ${renderTimelineSection({
        events: input.events,
        timelineHtml: renderTimelineItemsHtml(input.events),
        emptyMessage: "현재 필터와 일치하는 이벤트가 없습니다. 날짜 범위를 넓히거나 카테고리를 바꾸거나 제품/모델 필터를 비워 보세요.",
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
<html lang="${htmlLang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${pageTitle}</title>
    <style>${styles}</style>
  </head>
  <body>
    <main class="page">
      <section class="hero">
        <h1>${pageTitle}</h1>
        <p>기준일: ${formatUtcDate(input.exportedAt)}</p>
        <div class="hero__links">
          <a href="https://github.com/atjsh/llm-timeline" target="_blank" rel="noreferrer">${ui.staticRepoLink}</a>
        </div>
        <p>${ui.staticHowItWorksHtml}</p>
        ${renderStaticSourceList(input.sources)}
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
        <p class="empty-state" data-empty-state${input.events.length ? " hidden" : ""}>현재 필터와 일치하는 이벤트가 없습니다. 날짜 범위를 넓히거나 카테고리를 바꾸거나 제품/모델 필터를 비워 보세요.</p>
        <div class="feed-loader" data-static-loader hidden>
          <div class="feed-loader__controls">
            <button type="button" class="feed-loader__button" data-load-more>${ui.loadMore}</button>
            <p class="feed-loader__status" data-loader-status aria-live="polite">스냅샷을 불러오는 중...</p>
          </div>
          <div class="feed-loader__sentinel" data-loader-sentinel aria-hidden="true"></div>
        </div>
        <noscript>
          <p class="feed-loader__status">${ui.staticSnapshotJavascript}</p>
        </noscript>
      </section>
    </main>
    <script>${renderStaticInlineScript()}</script>
  </body>
</html>`;
};
