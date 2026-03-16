import assert from "node:assert/strict";
import { buildDailyCountsFromEvents, buildFeedsChartModel } from "../dist/html/chart.js";

const dailyCounts = buildDailyCountsFromEvents([
  { event_date: "2026-03-10T00:00:00.000Z" },
  { event_date: "2026-03-12T00:00:00.000Z" },
  { event_date: "2026-03-12T08:30:00.000Z" },
]);

assert.deepEqual(dailyCounts, [
  { day: "2026-03-10", count: 1 },
  { day: "2026-03-12", count: 2 },
]);

const dailyChart = buildFeedsChartModel(dailyCounts, {
  since: "2026-03-12",
  until: "2026-03-12",
});

assert.equal(dailyChart?.totalCount, 3);
assert.equal(dailyChart?.firstDay, "2026-03-10");
assert.equal(dailyChart?.lastDay, "2026-03-12");
assert.equal(dailyChart?.activeDay, "2026-03-12");
assert.equal(dailyChart?.weeks.length, 1);
assert.equal(dailyChart?.weeks[0].startDay, "2026-03-09");
assert.deepEqual(
  dailyChart?.weeks[0].cells.map((cell) => ({
    day: cell.day,
    count: cell.count,
    level: cell.level,
    active: cell.active,
    inRange: cell.inRange,
  })),
  [
    { day: "2026-03-09", count: 0, level: 0, active: false, inRange: false },
    { day: "2026-03-10", count: 1, level: 2, active: false, inRange: true },
    { day: "2026-03-11", count: 0, level: 0, active: false, inRange: true },
    { day: "2026-03-12", count: 2, level: 4, active: true, inRange: true },
    { day: "2026-03-13", count: 0, level: 0, active: false, inRange: false },
    { day: "2026-03-14", count: 0, level: 0, active: false, inRange: false },
    { day: "2026-03-15", count: 0, level: 0, active: false, inRange: false },
  ]
);
assert.deepEqual(
  dailyChart?.monthLabels.map((label) => ({ key: label.key, label: label.label, column: label.column })),
  [{ key: "2026-03", label: "Mar '26", column: 0 }]
);

const yearBoundaryChart = buildFeedsChartModel(
  buildDailyCountsFromEvents([
    { event_date: "2025-12-31T00:00:00.000Z" },
    { event_date: "2026-01-02T00:00:00.000Z" },
  ])
);

assert.deepEqual(
  yearBoundaryChart?.monthLabels.map((label) => label.label),
  ["Dec '25", "Jan '26"]
);
