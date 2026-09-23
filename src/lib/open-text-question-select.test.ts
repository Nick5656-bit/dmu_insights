import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { findElements, loadTestModule } from "./test-module-loader";
import type { OpenTextQuestionSelect as Component } from "../components/open-text-question-select";

for (const role of ["dmu", "club"]) {
  test(`${role}: open text selector wraps full questions and retains dashboard filters`, () => {
    const navigations: { url: string; options: unknown }[] = [];
    const select = Object.fromEntries(["Root", "Trigger", "Value", "Icon", "Portal", "Content", "ScrollUpButton", "ScrollDownButton", "Viewport", "Item", "ItemText"].map((key) => [key, `Select.${key}`]));
    const { OpenTextQuestionSelect } = loadTestModule<{ OpenTextQuestionSelect: typeof Component }>("src/components/open-text-question-select.tsx", {
      react: { useId: () => "question-label", useTransition: () => [false, (action: () => void) => action()] },
      "@radix-ui/react-select": select,
      "next/navigation": {
        usePathname: () => `/${role}/dashboard`,
        useSearchParams: () => new URLSearchParams("instanceIds=one&instanceIds=two&year=2026&role=RIDER&textQuestionId=q1"),
        useRouter: () => ({ replace: (url: string, options: unknown) => navigations.push({ url, options }) }),
      },
    });
    const questions = [
      { id: "q1", title: "Hvad fungerede særligt godt, som vi bør holde fast i næste gang?" },
      { id: "q2", title: "Hvis vi skulle forbedre én ting til næste løb, hvad skulle det så være?" },
    ];
    const tree = OpenTextQuestionSelect({ questions, selectedQuestionId: "q1" });
    assert.match(tree.props.className, /w-full.*max-w-\[620px\]/);
    const trigger = findElements(tree, select.Trigger)[0];
    assert.equal(trigger.props["aria-labelledby"], "question-label");
    assert.match(String(trigger.props.className), /min-h-11/);
    const title = findElements(trigger, "span")[0];
    assert.equal(title.props.children, questions[0].title);
    assert.match(String(title.props.className), /whitespace-normal/);
    assert.doesNotMatch(String(title.props.className), /truncate|line-clamp/);
    const items = findElements(tree, select.Item);
    assert.equal(items.length, 2);
    items.forEach((item, i) => {
      const text = findElements(item, "span")[0];
      assert.equal(text.props.children, questions[i].title);
      assert.match(String(text.props.className), /whitespace-normal/);
    });
    const root = findElements(tree, select.Root)[0];
    (root.props.onValueChange as (id: string) => void)("q2");
    const result = new URL(navigations[0].url, "https://example.invalid");
    assert.equal(result.pathname, `/${role}/dashboard`);
    assert.deepEqual(result.searchParams.getAll("instanceIds"), ["one", "two"]);
    assert.equal(result.searchParams.get("year"), "2026");
    assert.equal(result.searchParams.get("role"), "RIDER");
    assert.equal(result.searchParams.get("textQuestionId"), "q2");
    assert.deepEqual(navigations[0].options, { scroll: false });
    assert.match(readFileSync(`src/app/${role}/dashboard/page.tsx`, "utf8"), /<SurveyResultsPanel/);
  });
}
