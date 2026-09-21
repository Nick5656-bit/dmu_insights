import assert from "node:assert/strict";
import test from "node:test";
import { distributionColor } from "./distribution-colors";
import { findElements, loadTestModule } from "./test-module-loader";
import type * as Tile from "../components/charts/question-distribution-tile";

test("scale colors follow scores, not their array positions", () => {
  assert.equal(distributionColor("SCALE_1_5", "1", 4), "#dc4c4c");
  assert.equal(distributionColor("SCALE_1_5", "5", 0), "#27824b");
  assert.notEqual(distributionColor("SINGLE_CHOICE", "1", 0), "#dc4c4c");
});

test("distribution defaults to bars and offers a full pie with identical colors", () => {
  let state = "bar";
  const charts = Object.fromEntries(["Bar", "BarChart", "CartesianGrid", "Cell", "Pie", "PieChart", "ResponsiveContainer", "Tooltip", "XAxis", "YAxis"].map(name => [name, name]));
  const { QuestionDistributionTile } = loadTestModule<typeof Tile>("src/components/charts/question-distribution-tile.tsx", {
    react: { useState: (initial: string) => [state || initial, (value: string) => { state = value; }] },
    recharts: charts,
  });
  const props = { questionType: "SCALE_1_5" as const, title: "Test", category: "Test", avg: 3, count: 6, suppressed: false, suppressionThreshold: 5, data: [{ label: "1", value: 3 }, { label: "5", value: 3 }] };
  let tree = QuestionDistributionTile(props);
  assert.equal(findElements(tree, "BarChart").length, 1);
  assert.equal(findElements(tree, "PieChart").length, 0);
  const colors = findElements(tree, "Cell").map(cell => cell.props.fill);
  assert.deepEqual(colors, ["#dc4c4c", "#27824b"]);
  const buttons = findElements(tree, "button");
  assert.equal(buttons[0].props.children, "Søjler");
  assert.equal(buttons[0].props["aria-pressed"], true);
  (buttons[1].props.onClick as () => void)();
  tree = QuestionDistributionTile(props);
  assert.equal(findElements(tree, "Pie")[0].props.innerRadius, 0);
  assert.deepEqual(findElements(tree, "Cell").map(cell => cell.props.fill), colors);
  const hidden = QuestionDistributionTile({ ...props, suppressed: true });
  assert.equal(findElements(hidden, "PieChart").length, 0);
  assert.equal(findElements(hidden, "BarChart").length, 0);
  assert.equal(findElements(hidden, "button").length, 0);
});
