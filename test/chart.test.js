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
assert.equal(dailyChart?.unit, "day");
assert.equal(dailyChart?.totalCount, 3);
assert.deepEqual(
  dailyChart?.buckets.map((bucket) => ({ start: bucket.startDay, count: bucket.count, active: bucket.active })),
  [
    { start: "2026-03-10", count: 1, active: false },
    { start: "2026-03-11", count: 0, active: false },
    { start: "2026-03-12", count: 2, active: true },
  ]
);

const weeklyChart = buildFeedsChartModel(
  buildDailyCountsFromEvents([
    { event_date: "2026-01-01T00:00:00.000Z" },
    { event_date: "2026-02-12T00:00:00.000Z" },
    { event_date: "2026-03-05T00:00:00.000Z" },
  ])
);
assert.equal(weeklyChart?.unit, "week");
assert.ok((weeklyChart?.buckets.length ?? 0) > 3);

const monthlyChart = buildFeedsChartModel(
  buildDailyCountsFromEvents([
    { event_date: "2025-01-15T00:00:00.000Z" },
    { event_date: "2025-08-02T00:00:00.000Z" },
    { event_date: "2025-11-19T00:00:00.000Z" },
  ])
);
assert.equal(monthlyChart?.unit, "month");
assert.ok(monthlyChart?.buckets.some((bucket) => bucket.shortLabel.includes("2025")));
