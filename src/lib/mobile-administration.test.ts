import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { findElements, loadTestModule } from "./test-module-loader";
import type * as Calendar from "../components/event-calendar";
import type * as Users from "../components/club-user-list";

test("mobile calendar starts with the month's agenda, navigates years and retains event actions", () => {
  const states: unknown[] = [new Date(2026, 11, 23)];
  let cursor = 0;
  const { EventCalendar } = loadTestModule<typeof Calendar>("src/components/event-calendar.tsx", {
    "next/link": "a",
    react: {
      useMemo: (factory: () => unknown) => factory(),
      useState: (initial: unknown) => {
        const index = cursor++;
        if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
        return [states[index], (value: unknown) => { states[index] = value; }];
      },
    },
  });
  const items = [
    { id: "january", dateKey: "2027-01-04", title: "Januar-arrangement", details: [] },
    { id: "december", dateKey: "2026-12-19", title: "December-arrangement", details: [], actions: [{ label: "Åbn arrangement", href: "/club/surveys/december" }] },
  ];
  const render = () => { cursor = 0; return EventCalendar({ items, emptyText: "Ingen arrangementer på dagen." }); };
  let tree = render();
  const click = (label: string) => {
    const button = findElements(tree, "button").find(button => button.props["aria-label"] === label || button.props.children === label)!;
    (button.props.onClick as () => void)();
    tree = render();
  };
  const markup = () => renderToStaticMarkup(tree as ReactNode);
  assert.equal(findElements(tree, "button").find(button => button.props.children === "Liste")?.props["aria-pressed"], true);
  assert.match(markup(), /December-arrangement/);
  assert.doesNotMatch(markup(), /Januar-arrangement/);
  assert.match(markup(), /href="\/club\/surveys\/december"/);
  click("Næste måned");
  assert.match(markup(), /januar 2027/);
  assert.match(markup(), /Januar-arrangement/);
  assert.doesNotMatch(markup(), /December-arrangement/);
  click("Kalender");
  assert.equal(findElements(tree, "button").find(button => button.props.children === "Kalender")?.props["aria-pressed"], true);
  const selected = findElements(tree, "button").find(button => String(button.props["aria-label"]).includes("4. januar"));
  assert.equal(selected?.props["aria-pressed"], true);
  click("Næste måned");
  assert.match(markup(), /Ingen arrangementer i denne måned/);
  click("I dag");
  assert.match(markup(), /december 2026/);
  assert.equal(findElements(tree, "button").filter(button => button.props["aria-current"] === "date").length, 1);
});

test("responsive club-user cards preserve identities and both server actions", () => {
  const Edit = () => null;
  const Delete = () => null;
  const { ClubUserList } = loadTestModule<typeof Users>("src/components/club-user-list.tsx", {
    "@/components/edit-club-user-button": { EditClubUserButton: Edit },
    "@/components/delete-club-user-button": { DeleteClubUserButton: Delete },
  });
  const updateAction = async () => {};
  const deleteAction = async () => {};
  const users = [{ id: "a", name: "Klubadministrator A", email: "a@example.test" }, { id: "b", name: "Klubadministrator B", email: "b@example.test" }];
  const tree = ClubUserList({ users, updateAction, deleteAction });
  assert.equal(findElements(tree, "li").length, 2);
  assert.deepEqual(findElements(tree, Edit).map(element => element.props.userId), ["a", "b"]);
  assert.ok(findElements(tree, Edit).every(element => element.props.action === updateAction));
  assert.ok(findElements(tree, Delete).every(element => element.props.action === deleteAction));
});

test("response dialog uses focus-managed, labelled portal with bounded mobile scrolling", () => {
  const source = readFileSync("src/components/text-responses-modal.tsx", "utf8");
  for (const part of ["Dialog.Portal", "Dialog.Overlay", "Dialog.Content", "Dialog.Title", "Dialog.Description", "Dialog.Close"]) assert.ok(source.includes(part));
  assert.match(source, /100dvh-1rem/);
  assert.match(source, /min-h-0 flex-1 overflow-y-auto/);
  assert.match(source, /showMetadata &&/);
});
