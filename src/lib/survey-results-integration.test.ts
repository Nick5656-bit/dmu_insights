import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTestModule, findElements } from "./test-module-loader";

test("DMU comparison does not leak a one-answer club via the national average", async () => {
  const Chart = () => null;
  const Panel = () => null;
  const calls: unknown[] = [];
  const clubs = [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "small", name: "Small" }];
  const q = { id: "q", title: "Samme spørgsmål", questionType: "SCALE_1_5", benchmarkKey: "SATISFACTION_OVERALL", options: [] };
  const prisma = {
    club: { findMany: async () => clubs },
    surveyTemplate: { findMany: async () => [{ id: "t", name: "Skabelon", surveyType: "EVENT", _count: { surveyInstances: 3 } }] },
    surveyInstance: { findMany: async () => [{ id: "s1" }, { id: "s2" }] },
    surveyResponse: { count: async () => 11 },
    question: { findMany: async () => [q] },
    surveyAnswer: { findMany: async (args: { where: { surveyResponse: { clubId?: string | { in: string[] }; surveyInstance: unknown } } }) => {
      calls.push(args.where.surveyResponse.surveyInstance);
      const club = args.where.surveyResponse.clubId;
      const count = club === "small" ? 1 : typeof club === "string" ? 5 : 11;
      return Array.from({ length: count }, (_, i) => ({ questionId: "q", surveyResponseId: `${club}-${i}`, numericValue: club === "small" ? 1 : 5, optionValue: null, textValue: null }));
    } },
  };
  const page = loadTestModule<{ default: (props: { searchParams: Promise<Record<string, string>> }) => Promise<unknown> }>("src/app/dmu/dashboard/page.tsx", {
    "@/lib/prisma": { prisma }, "@/lib/auth": { requireRole: async () => ({ role: "DMU_ADMIN" }) },
    "@/components/charts/benchmark-bar-chart": { ClubComparisonChart: Chart },
    "@/components/survey-results-panel": { SurveyResultsPanel: Panel },
    "@/components/club-multi-select-filter": { ClubMultiSelectFilter: () => null },
  });
  const tree = await page.default({ searchParams: Promise.resolve({ clubIds: "a,b,small", surveyTemplateId: "t", year: "2026" }) });
  const chart = findElements(tree, Chart)[0];
  assert.deepEqual(chart.props.data, [{ label: "A", own: 5, benchmark: 5 }, { label: "B", own: 5, benchmark: 5 }]);
  assert.ok(calls.every((where) => JSON.stringify(where).includes('"surveyTemplateId":"t"')));
  assert.ok(calls.every((where) => JSON.stringify(where).includes('"sentAt"')));
});
