import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTestModule } from "./test-module-loader";
import type { EventCalendar } from "../components/event-calendar";

test("calendar selection and keyboard focus stay inside the scroll container", () => {
  const calendar = loadTestModule<{ EventCalendar: typeof EventCalendar }>("src/components/event-calendar.tsx", {});
  const markup = renderToStaticMarkup(createElement(calendar.EventCalendar, {
    title: "Kalender", items: [], emptyText: "Ingen arrangementer.",
  }));
  const dayButtons = [...markup.matchAll(/<button[^>]*class="([^"]*min-h-24[^"]*)"/g)].map((match) => match[1]);
  assert.ok(dayButtons.length >= 28);
  assert.ok(dayButtons.every((classes) => classes.includes("flex-col") && classes.includes("min-w-0")));
  assert.ok(dayButtons.every((classes) => classes.includes("focus-visible:ring-inset")));
  assert.ok(dayButtons.some((classes) => classes.includes("ring-1 ring-inset ring-primary")));
  assert.match(markup, /overflow-x-auto p-1/);
});
