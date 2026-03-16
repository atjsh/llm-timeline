export type FeedsChartUnit = "day" | "week" | "month";

export interface DailyEventCount {
  day: string;
  count: number;
}

export interface FeedsChartBucket {
  key: string;
  startDay: string;
  endDay: string;
  label: string;
  shortLabel: string;
  count: number;
  active: boolean;
  ariaLabel: string;
}

export interface FeedsChartModel {
  unit: FeedsChartUnit;
  buckets: FeedsChartBucket[];
  totalCount: number;
  maxCount: number;
  selectionLabel: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

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

const toDayString = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
};

const parseDay = (day: string) => Date.parse(`${day}T00:00:00.000Z`);

const formatDayFromMs = (value: number) => new Date(value).toISOString().slice(0, 10);

const formatShortDay = (day: string) => shortDayFormatter.format(new Date(`${day}T00:00:00.000Z`));

const formatFullDay = (day: string) => fullDayFormatter.format(new Date(`${day}T00:00:00.000Z`));

const formatMonthLabel = (day: string) => monthFormatter.format(new Date(`${day}T00:00:00.000Z`));

const formatMonthShort = (day: string) => monthShortFormatter.format(new Date(`${day}T00:00:00.000Z`));

const startOfWeek = (value: number) => {
  const date = new Date(value);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return value + mondayOffset * DAY_MS;
};

const startOfMonth = (value: number) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
};

const addDays = (value: number, days: number) => value + days * DAY_MS;

const addWeeks = (value: number, weeks: number) => addDays(value, weeks * 7);

const addMonths = (value: number, months: number) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
};

const bucketUnitForRange = (rangeDays: number): FeedsChartUnit => {
  if (rangeDays <= 45) return "day";
  if (rangeDays <= 240) return "week";
  return "month";
};

const formatSelectionLabel = (sinceDay: string | null, untilDay: string | null) => {
  if (sinceDay && untilDay) {
    if (sinceDay === untilDay) return formatFullDay(sinceDay);
    return `${formatFullDay(sinceDay)} to ${formatFullDay(untilDay)}`;
  }
  if (sinceDay) return `From ${formatFullDay(sinceDay)}`;
  if (untilDay) return `Through ${formatFullDay(untilDay)}`;
  return null;
};

const formatBucketLabel = (unit: FeedsChartUnit, startDay: string, endDay: string) => {
  if (unit === "day") {
    return {
      label: formatFullDay(startDay),
      shortLabel: formatShortDay(startDay),
    };
  }
  if (unit === "week") {
    return {
      label: `${formatFullDay(startDay)} to ${formatFullDay(endDay)}`,
      shortLabel: formatShortDay(startDay),
    };
  }
  return {
    label: formatMonthLabel(startDay),
    shortLabel: formatMonthShort(startDay),
  };
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
  const rangeDays = Math.floor((lastMs - firstMs) / DAY_MS) + 1;
  const unit = bucketUnitForRange(rangeDays);

  const selectedSinceDay = toDayString(selection.since);
  const selectedUntilDay = toDayString(selection.until);

  let cursor = unit === "day" ? firstMs : unit === "week" ? startOfWeek(firstMs) : startOfMonth(firstMs);
  const boundary = unit === "day" ? lastMs : unit === "week" ? startOfWeek(lastMs) : startOfMonth(lastMs);
  const buckets: FeedsChartBucket[] = [];

  while (cursor <= boundary) {
    const bucketStart = formatDayFromMs(cursor);
    const rawEnd =
      unit === "day"
        ? cursor
        : unit === "week"
        ? addDays(cursor, 6)
        : addDays(addMonths(cursor, 1), -1);
    const bucketEnd = formatDayFromMs(rawEnd);
    let count = 0;
    for (const [day, value] of countsByDay.entries()) {
      if (day >= bucketStart && day <= bucketEnd) {
        count += value;
      }
    }
    const labels = formatBucketLabel(unit, bucketStart, bucketEnd);
    const active = selectedSinceDay === bucketStart && selectedUntilDay === bucketEnd;
    buckets.push({
      key: `${bucketStart}:${bucketEnd}`,
      startDay: bucketStart,
      endDay: bucketEnd,
      label: labels.label,
      shortLabel: labels.shortLabel,
      count,
      active,
      ariaLabel: `${labels.label}: ${count} event${count === 1 ? "" : "s"}`,
    });
    cursor = unit === "day" ? addDays(cursor, 1) : unit === "week" ? addWeeks(cursor, 1) : addMonths(cursor, 1);
  }

  const totalCount = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 1);
  const activeBucket = buckets.find((bucket) => bucket.active);

  return {
    unit,
    buckets,
    totalCount,
    maxCount,
    selectionLabel: activeBucket?.label ?? formatSelectionLabel(selectedSinceDay, selectedUntilDay),
  };
};
