import assert from "node:assert/strict";
import { test } from "node:test";
import { surveyProgress } from "./survey-progress";
import { loadTestModule, findElements } from "./test-module-loader";
import type { WizardStep } from "../components/survey-wizard";
import { respondentAgeGroupOptions, respondentRoleOptions } from "./survey-segments";

const steps: WizardStep[] = [
  { kind: "INTRO", title: "Intro", description: "" },
  { kind: "SEGMENT", id: "age", segment: "respondentAgeGroup", title: "Alder", description: "", options: respondentAgeGroupOptions },
  { kind: "SEGMENT", id: "role", segment: "respondentRole", title: "Rolle", description: "", options: respondentRoleOptions },
  { kind: "SEGMENT", id: "class", segment: "motocrossClass", title: "Klasse", description: "", options: [{ value: "C_MX2", label: "C MX2" }] },
  ...Array.from({ length: 8 }, (_, i): WizardStep => ({ kind: "QUESTION", id: `q${i}`, questionId: `q${i}`, title: `Spørgsmål ${i}`, description: null, questionType: "SCALE_1_5", required: true, options: [] })),
];

test("progress includes visible segments, excludes headings and reaches the full total even for optional questions", () => {
  assert.deepEqual(surveyProgress(steps, 0), { total: 11, position: 0, percent: 0 });
  assert.deepEqual(surveyProgress(steps, 1), { total: 11, position: 1, percent: 9 });
  assert.equal(surveyProgress(steps, 4).position, 4);
  assert.deepEqual(surveyProgress(steps, 11), { total: 11, position: 11, percent: 100 });
  const withHeading: WizardStep[] = [...steps.slice(0, 4), { kind: "HEADING", id: "heading", title: "Afsnit" }, ...steps.slice(4)];
  assert.equal(surveyProgress(withHeading, 4).position, 3);
  assert.equal(surveyProgress(withHeading, 5).position, 4);
  assert.equal(surveyProgress(withHeading, 5).total, 11);
  const nonRider = steps.filter(step => step.kind !== "SEGMENT" || step.segment !== "motocrossClass");
  assert.deepEqual(surveyProgress(nonRider, 3), { total: 10, position: 3, percent: 30 });
});

for (const rider of [true, false]) test(`wizard auto-advances segments and counts the ${rider ? "rider" : "non-rider"} route end to end`, async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { scrollTo: () => {} } });
  t.after(() => { if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window"); });
  const states: unknown[] = [], refs: { current: unknown }[] = [];
  let stateIndex = 0, refIndex = 0;
  const submissions: FormData[] = [];
  const { SurveyWizard } = loadTestModule<{ SurveyWizard: (props: { steps: WizardStep[]; submitAction: (f: FormData) => Promise<{ success: true }> }) => unknown }>("src/components/survey-wizard.tsx", {
    react: {
      useState: (initial: unknown) => { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], (value: unknown) => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
      useRef: (initial: unknown) => { const i = refIndex++; return refs[i] ?? (refs[i] = { current: initial }); },
      useMemo: (compute: () => unknown) => compute(), useEffect: () => {},
      useTransition: () => [false, (action: () => void) => action()],
    },
    "next/navigation": { useRouter: () => ({ replace: () => {} }) },
    "next/link": { default: () => null },
    "@/components/dmu-logo": { DmuLogo: () => null },
    "@/components/submit-button": { LoadingSpinner: () => null },
  });
  const render = () => { stateIndex = 0; refIndex = 0; return SurveyWizard({ steps, submitAction: async data => { submissions.push(data); return { success: true }; } }); };
  let tree = render();
  const click = (label: string | number) => { const button = findElements(tree, "button").find(b => b.props.children === label); assert.ok(button, `Missing button: ${label}`); (button.props.onClick as () => void)(); tree = render(); };
  const tick = () => { t.mock.timers.tick(400); tree = render(); };
  const progress = () => findElements(tree, "div").find(d => d.props.role === "progressbar")!.props;
  click("Næste →");
  assert.equal(progress()["aria-valuenow"], 1);
  click("18–30 år");
  click("← Tilbage"); tick();
  assert.equal(progress()["aria-valuenow"], 0); // Back cancels the pending timer.
  click("Næste →");
  click("18–30 år"); tick();
  assert.equal(progress()["aria-valuenow"], 2);
  click(rider ? "Aktiv kører" : "Frivillig");
  click("Næste →"); tick(); // Manual Next and auto-advance must not skip a step.
  if (rider) {
    assert.equal(progress()["aria-valuenow"], 3);
    const select = findElements(tree, "select")[0];
    (select.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: "C_MX2" } });
    tree = render(); tick();
  }
  assert.equal(progress()["aria-valuenow"], rider ? 4 : 3);
  assert.equal(progress()["aria-valuemax"], rider ? 11 : 10);
  for (let i = 0; i < 8; i++) { click(4); tick(); }
  assert.equal(progress()["aria-valuenow"], rider ? 11 : 10);
  assert.equal(submissions.length, 0); // Final answer never auto-submits.
  click("Indsend svar");
  await Promise.resolve();
  const submitted = submissions.at(-1);
  assert.ok(submitted);
  assert.equal(submitted.get("segment_respondentRole"), rider ? "RIDER" : "VOLUNTEER");
  assert.equal(submitted.get("segment_motocrossClass"), rider ? "C_MX2" : null);
  assert.equal(submitted.get("question_q7"), "4");
});
