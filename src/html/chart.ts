export interface DailyEventCount {
  day: string;
  count: number;
}

export interface FeedsChartCell {
  day: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
  active: boolean;
  inRange: boolean;
  ariaLabel: string;
}

export interface FeedsChartWeek {
  startDay: string;
  cells: FeedsChartCell[];
}

export interface FeedsChartMonthLabel {
  key: string;
  label: string;
  column: number;
}

export interface FeedsChartModel {
  weeks: FeedsChartWeek[];
  monthLabels: FeedsChartMonthLabel[];
  totalCount: number;
  maxCount: number;
  selectionLabel: string | null;
  firstDay: string;
  lastDay: string;
  activeDay: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

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

const toDayString = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
};

const parseDay = (day: string) => Date.parse(`${day}T00:00:00.000Z`);

const formatDayFromMs = (value: number) => new Date(value).toISOString().slice(0, 10);

const formatFullDay = (day: string) => fullDayFormatter.format(new Date(`${day}T00:00:00.000Z`));

const formatMonthAxisLabel = (day: string, previousYear: string | null) => {
  const date = new Date(`${day}T00:00:00.000Z`);
  const month = shortMonthFormatter.format(date);
  const yearKey = day.slice(0, 4);
  return previousYear === yearKey ? month : `${yearFormatter.format(date)} ${month}`;
};

const weekdayIndex = (value: number) => {
  const day = new Date(value).getUTCDay();
  return day === 0 ? 6 : day - 1;
};

const startOfWeek = (value: number) => value - weekdayIndex(value) * DAY_MS;

const addDays = (value: number, days: number) => value + days * DAY_MS;

const formatSelectionLabel = (sinceDay: string | null, untilDay: string | null) => {
  if (sinceDay && untilDay) {
    if (sinceDay === untilDay) return formatFullDay(sinceDay);
    return `${formatFullDay(sinceDay)} ~ ${formatFullDay(untilDay)}`;
  }
  if (sinceDay) return `${formatFullDay(sinceDay)}부터`;
  if (untilDay) return `${formatFullDay(untilDay)}까지`;
  return null;
};

const levelForCount = (count: number, maxCount: number): 0 | 1 | 2 | 3 | 4 => {
  if (count <= 0) return 0;
  if (maxCount <= 1) return 4;
  return Math.min(4, Math.max(1, Math.ceil((count / maxCount) * 4))) as 1 | 2 | 3 | 4;
};

export const buildDailyCountsFromEvents = (events: Array<{ event_date: string }>): DailyEventCount[] => {
  const counts = new Map<string, number>();
  for (const event of events) {
    const day = toDayString(event.event_date);
    if (!day) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([day, count]) => ({ day, count }));
};

export const buildFeedsChartModel = (
  dailyCounts: DailyEventCount[],
  selection: { since?: string | null; until?: string | null } = {}
): FeedsChartModel | null => {
  if (!dailyCounts.length) return null;

  const countsByDay = new Map(dailyCounts.map((entry) => [entry.day, entry.count]));
  const firstDay = dailyCounts[0].day;
  const lastDay = dailyCounts[dailyCounts.length - 1].day;
  const firstMs = parseDay(firstDay);
  const lastMs = parseDay(lastDay);
  const firstGridMs = startOfWeek(firstMs);
  const lastGridMs = addDays(startOfWeek(lastMs), 6);
  const selectedSinceDay = toDayString(selection.since);
  const selectedUntilDay = toDayString(selection.until);
  const activeDay =
    selectedSinceDay && selectedUntilDay && selectedSinceDay === selectedUntilDay ? selectedSinceDay : null;
  const totalCount = dailyCounts.reduce((sum, entry) => sum + entry.count, 0);
  const maxCount = Math.max(...dailyCounts.map((entry) => entry.count), 1);
  const weeks: FeedsChartWeek[] = [];
  const monthLabels: FeedsChartMonthLabel[] = [];
  let previousMonthKey: string | null = null;
  let previousMonthYear: string | null = null;

  for (let weekStart = firstGridMs, weekIndex = 0; weekStart <= lastGridMs; weekStart += DAY_MS * 7, weekIndex += 1) {
    const cells: FeedsChartCell[] = [];

    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const currentMs = addDays(weekStart, dayOffset);
      const day = formatDayFromMs(currentMs);
      const inRange = day >= firstDay && day <= lastDay;
      const count = inRange ? countsByDay.get(day) ?? 0 : 0;
      const monthKey = day.slice(0, 7);

      if (inRange && monthKey !== previousMonthKey) {
        monthLabels.push({
          key: monthKey,
          label: formatMonthAxisLabel(day, previousMonthYear),
          column: weekIndex,
        });
        previousMonthKey = monthKey;
        previousMonthYear = day.slice(0, 4);
      }

      cells.push({
        day,
        count,
        level: inRange ? levelForCount(count, maxCount) : 0,
        active: activeDay === day,
        inRange,
        ariaLabel: `${formatFullDay(day)}: 이벤트 ${count}개`,
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
    selectionLabel: activeDay ? formatFullDay(activeDay) : formatSelectionLabel(selectedSinceDay, selectedUntilDay),
    firstDay,
    lastDay,
    activeDay,
  };
};
