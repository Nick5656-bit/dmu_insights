import assert from "node:assert/strict";
import { test } from "node:test";
import { buildResultOverview, buildResultTimeline, type OverviewSeries } from "./result-overview";
import { loadTestModule, findElements } from "./test-module-loader";

const series: OverviewSeries[] = [
  { id: "new", label: "Nyt løb", date: "2026-09-12T12:00:00Z", questions: [
    { id: "q1", title: "Sikkerhed", category: "Sikkerhed", sum: 20, count: 5 },
    { id: "q2", title: "Bane", category: "Bane", sum: 15, count: 5 },
  ] },
  { id: "old", label: "Tidligere løb", date: "2026-08-10T12:00:00Z", questions: [
    { id: "q1", title: "Sikkerhed", category: "Sikkerhed", sum: 30, count: 10 },
    { id: "q2", title: "Bane", category: "Bane", sum: 10, count: 5 },
    { id: "extra", title: "Ekstra", category: "Bane", sum: 25, count: 5 },
  ] },
];

test("timeline sorts dates without changing the bar chart's weighted common-question means", () => {
  const bar = buildResultOverview(series);
  const points = buildResultTimeline(series);
  assert.deepEqual(points.map(p => p.id), ["old", "new"]);
  assert.deepEqual(points.map(p => p.value), [bar.means[1].value, bar.means[0].value]);
  assert.equal(points[0].value, 40 / 15);
  assert.deepEqual(buildResultTimeline(series, "Sikkerhed").map(p => p.value), [3, 4]);
  assert.deepEqual(buildResultTimeline(series, "Bane").map(p => p.value), [2, 3]);
  assert.deepEqual(buildResultTimeline(series, "Missing"), []);
  assert.equal(series[0].id, "new"); // Never mutate the shared series order.
});

test("missing dates and insufficient or nonshared questions cannot produce a misleading trend", () => {
  assert.deepEqual(buildResultTimeline(series.slice(0, 1)), []);
  assert.deepEqual(buildResultTimeline([series[0], { ...series[1], date: undefined }]), []);
  assert.deepEqual(buildResultTimeline([series[0], { ...series[1], date: "not a date" }]), []);
  assert.deepEqual(buildResultTimeline([series[0], { ...series[1], questions: [] }]), []);
  const low = { ...series[1], questions: series[1].questions.map(q => ({ ...q, count: 4 })) };
  assert.deepEqual(buildResultTimeline([series[0], low]), []);
  const sameDay = buildResultTimeline(series.map(s => ({ ...s, date: series[0].date })));
  assert.equal(sameDay.length, 2); // Separate events are not merged just because their dates coincide.
});

test("switch replaces the chart in place, category selection changes the line and single-event mode is disabled", () => {
  let state: unknown[] = ["comparison", ""];
  let cursor = 0;
  const Bars = () => null, Lines = () => null;
  const { ResultOverviewChart } = loadTestModule<{ ResultOverviewChart: (props: { series: OverviewSeries[]; comparison: boolean }) => unknown }>("src/components/charts/result-overview-chart.tsx", {
    react: { useState: () => { const index = cursor++; return [state[index], (value: unknown) => { state[index] = value; }]; } },
    recharts: Object.fromEntries(["Bar", "BarChart", "CartesianGrid", "Line", "LineChart", "ReferenceLine", "ResponsiveContainer", "Tooltip", "XAxis", "YAxis"].map(name => [name, name === "BarChart" ? Bars : name === "LineChart" ? Lines : () => null])),
  });
  const render = (selected = series) => { cursor = 0; return ResultOverviewChart({ series: selected, comparison: selected.length > 1 }); };
  let tree = render();
  assert.equal(findElements(tree, Bars).length, 1);
  assert.equal(findElements(tree, Lines).length, 0);
  const toggle = findElements(tree, "button").find(b => b.props.children === "Udvikling over tid")!;
  assert.equal(toggle.props.disabled, false);
  (toggle.props.onClick as () => void)();
  tree = render();
  assert.equal(findElements(tree, Bars).length, 0);
  assert.equal(findElements(tree, Lines).length, 1);
  const picker = findElements(tree, "select")[0];
  (picker.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: "Sikkerhed" } });
  tree = render();
  assert.deepEqual((findElements(tree, Lines)[0].props.data as { value: number }[]).map(p => p.value), [3, 4]);
  const back = findElements(tree, "button").find(b => b.props.children === "Sammenligning")!;
  (back.props.onClick as () => void)();
  assert.equal(findElements(render(), Bars).length, 1);
  state = ["timeline", "category no longer selected"];
  tree = render(series.slice(0, 1));
  assert.equal(findElements(tree, Bars).length, 1);
  assert.equal(findElements(tree, Lines).length, 0);
  assert.equal(findElements(tree, "button").find(b => b.props.children === "Udvikling over tid")!.props.disabled, true);
});

test("server sends event dates with sent/created fallback and keeps queries scoped", async () => {
  const dates = [new Date("2026-07-01"), new Date("2026-08-01"), new Date("2026-09-01")];
  const where = { clubId: "own-club" };
  const { loadResultOverview } = loadTestModule<{ loadResultOverview: (response: unknown, instance: unknown) => Promise<OverviewSeries[]> }>("src/lib/result-overview.server.ts", {
    "@/lib/prisma": { prisma: {
      surveyInstance: { findMany: async (query: { where: unknown; select: { event: unknown } }) => {
        assert.deepEqual(query.where, where);
        assert.deepEqual(query.select.event, { select: { eventDate: true } });
        return [
          { id: "event", name: "Event", club: { name: "Club" }, event: { eventDate: dates[0] }, sentAt: dates[1], createdAt: dates[2] },
          { id: "sent", name: "Annual", club: { name: "Club" }, event: null, sentAt: dates[1], createdAt: dates[2] },
          { id: "created", name: "Draft", club: { name: "Club" }, event: null, sentAt: null, createdAt: dates[2] },
        ];
      } }, question: { findMany: async () => [] }, surveyAnswer: { findMany: async () => [] },
    } },
  });
  const rows = await loadResultOverview(where, where);
  assert.deepEqual(rows.map(r => r.date), dates.map(d => d.toISOString()));
  assert.ok(rows.every(r => r.questions.length === 0));
});
