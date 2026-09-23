import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { findElements, loadTestModule } from "./test-module-loader";
import type * as Filters from "../components/mobile-filter-panel";
import type * as Navigation from "../components/app-nav";
import { MobileResultBars } from "../components/charts/mobile-result-bars";
import { buildResultOverview } from "./result-overview";

test("mobile filters toggle without duplicating or discarding the desktop form", () => {
  let open = false;
  const { MobileFilterPanel } = loadTestModule<typeof Filters>("src/components/mobile-filter-panel.tsx", {
    react: { useId: () => "filters", useState: () => [open, (value: boolean) => { open = value; }] },
  });
  const form = createElement("form", null, "Existing form with selections");
  const render = () => MobileFilterPanel({ count: 2, children: form });
  let tree = render();
  let button = findElements(tree, "button")[0];
  assert.equal(button.props["aria-expanded"], false);
  assert.equal(button.props["aria-controls"], "filters");
  const panel = () => findElements(tree, "div").find(div => div.props.id === "filters")!;
  assert.equal(panel().props.children, form);
  assert.match(String(panel().props.className), /hidden sm:block/);
  (button.props.onClick as () => void)();
  tree = render();
  assert.equal(findElements(tree, "button")[0].props["aria-expanded"], true);
  assert.equal(panel().props.className, "block");
  button = findElements(tree, "button")[0];
  (button.props.onClick as () => void)();
  tree = render();
  assert.equal(panel().props.children, form);
});

for (const role of ["dmu", "club"]) test(`${role}: mobile menu retains links, closes on navigation and supports Escape`, () => {
  let focused = false;
  const details = { open: true, querySelector: () => ({ focus: () => { focused = true; } }) };
  const { AppNav } = loadTestModule<typeof Navigation>("src/components/app-nav.tsx", {
    react: { useRef: () => ({ current: details }) },
    "next/link": "a",
    "next/navigation": { usePathname: () => `/${role}/dashboard` },
  });
  const navItems = [{ href: `/${role}/dashboard`, label: "Dashboard", children: [{ href: `/${role}/dashboard/details`, label: "Detaljer" }] }, { href: `/${role}/events`, label: "Arrangementer" }];
  const tree = AppNav({ variant: "mobile", navItems });
  assert.equal(tree.type, "details");
  assert.equal(findElements(tree, "a").length, 3);
  assert.equal(findElements(tree, "a")[0].props["aria-current"], "page");
  (tree.props.onKeyDown as (event: { key: string }) => void)({ key: "Escape" });
  assert.equal(details.open, false);
  assert.equal(focused, true);
  details.open = true;
  const wrapper = findElements(tree, "div").find(node => node.props.onClick)!;
  (wrapper.props.onClick as (event: unknown) => void)({ target: { closest: () => ({}) } });
  assert.equal(details.open, false);
  assert.equal(AppNav({ variant: "sidebar", navItems }).type, "nav");
});

test("mobile bars use exactly the same eligible categories, values and means as desktop", () => {
  const overview = buildResultOverview([
    { id: "a", label: "Løb A", questions: [{ id: "safe", category: "Sikkerhed og forhold på banen", title: "Sikkerhed", sum: 20, count: 5 }, { id: "hidden", category: "Skjult", title: "Skjult", sum: 12, count: 4 }] },
    { id: "b", label: "Løb B", questions: [{ id: "safe", category: "Sikkerhed og forhold på banen", title: "Sikkerhed", sum: 15, count: 5 }] },
  ]);
  const tree = MobileResultBars({ ...overview, color: index => index ? "orange" : "navy" });
  assert.match(tree.props.className, /sm:hidden/);
  assert.equal(findElements(tree, "h3").length, 1);
  assert.equal(findElements(tree, "h3")[0].props.children, "Sikkerhed og forhold på banen");
  const bars = findElements(tree, "div").filter(node => (node.props.style as { width?: string } | undefined)?.width);
  assert.deepEqual(bars.map(node => (node.props.style as { width: string }).width), ["80%", "60%"]);
  const references = findElements(tree, "span").filter(node => (node.props.style as { left?: string } | undefined)?.left);
  assert.deepEqual(references.map(node => (node.props.style as { left: string }).left), ["80%", "60%"]);
});

test("both dashboards use mobile filter disclosure and compact two-column statistics", () => {
  for (const role of ["dmu", "club"]) {
    const source = readFileSync(`src/app/${role}/dashboard/page.tsx`, "utf8");
    assert.match(source, /<MobileFilterPanel key=\{exportParams.toString\(\)\}/);
    assert.match(source, /grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4/);
  }
});
