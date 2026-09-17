import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTestModule, findElements } from "./test-module-loader";
import type { OverviewSeries } from "./result-overview";

for (const categories of [1, 5, 12, 13]) for (const datasets of [1, 2]) {
  test(`${categories} categories and ${datasets} datasets: horizontal scrolling only above twelve categories`, () => {
    const Container = () => null;
    const chart = loadTestModule<{ ResultOverviewChart: (props: { series: OverviewSeries[] }) => unknown }>(
      "src/components/charts/result-overview-chart.tsx",
      { react: { useState: (initial: unknown) => [initial, () => {}] }, recharts: Object.fromEntries(["Bar", "BarChart", "CartesianGrid", "ReferenceLine", "ResponsiveContainer", "Tooltip", "XAxis", "YAxis"].map(name => [name, name === "ResponsiveContainer" ? Container : () => null])) },
    );
    const series = Array.from({ length: datasets }, (_, i) => ({
      id: String(i), label: `Arrangement ${i}`,
      questions: Array.from({ length: categories }, (_, j) => ({ id: String(j), title: `Spørgsmål ${j}`, category: `Kategori ${j}`, sum: 20, count: 5 })),
    }));
    const tree = chart.ResultOverviewChart({ series });
    const region = findElements(tree, "div").find(node => node.props.role === "region")!;
    const scroll = categories > 12;
    assert.ok(String(region.props.className).includes(scroll ? "overflow-x-auto" : "overflow-x-hidden"));
    assert.equal(region.props.tabIndex, scroll ? 0 : undefined);
    const frame = findElements(region.props.children, "div").find(node => node.props.style)!;
    const style = frame.props.style as { width: string; minWidth: number };
    assert.equal(style.width, "100%");
    assert.equal(style.minWidth, scroll ? categories * (80 + datasets * 25) : 0);
    assert.equal(findElements(tree, Container)[0].props.minWidth, 0);
  });
}
