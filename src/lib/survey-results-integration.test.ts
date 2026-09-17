import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTestModule, findElements } from "./test-module-loader";
import type { OverviewSeries } from "./result-overview";

for (const role of ["club", "dmu"] as const) test(`${role} overview independently suppresses small events and scopes every query`, async () => {
  const Chart = () => null;
  const calls: string[] = [];
  const instances = ["a", "b", "small"].map(id => ({ id, name: id, createdAt: new Date("2026-09-01"), club: { name: "Club A" } }));
  const q = { id: "q", title: "Sikkerhed", questionType: "SCALE_1_5", benchmarkKey: "SAFETY_OVERALL", options: [] };
  const prisma = {
    club: { findMany: async () => [{ id: "club-a", name: "Club A" }], findUnique: async () => ({ isTest: true }) },
    surveyTemplate: { findMany: async () => [] },
    surveyInstance: { findMany: async ({ where }: { where: unknown }) => { calls.push(JSON.stringify(where)); return instances; }, count: async () => 3 },
    member: { count: async () => 20 }, surveyInvitation: { count: async () => 20 },
    surveyResponse: { count: async () => 14 },
    question: { findMany: async () => [q] },
    surveyAnswer: { findMany: async ({ where }: { where: unknown }) => {
      calls.push(JSON.stringify(where));
      return instances.flatMap(s => Array.from({ length: s.id === "small" ? 4 : 5 }, (_, i) => ({
        questionId: "q", surveyResponseId: `private-response-${s.id}-${i}`, numericValue: s.id === "small" ? 1 : 5,
        optionValue: null, textValue: null, surveyResponse: { surveyInstanceId: s.id },
      })));
    } },
  };
  const page = loadTestModule<{ default: (props: { searchParams: Promise<Record<string, string>> }) => Promise<unknown> }>(`src/app/${role}/dashboard/page.tsx`, {
    "@/lib/prisma": { prisma }, "@/lib/auth": { requireRole: async (required: string) => { assert.equal(required, role === "dmu" ? "DMU_ADMIN" : "CLUB_ADMIN"); return { clubId: "club-a" }; } },
    "@/components/charts/result-overview-chart": { ResultOverviewChart: Chart },
    "@/components/survey-results-panel": { SurveyResultsPanel: () => null },
    "@/components/club-multi-select-filter": { ClubMultiSelectFilter: () => null },
  });
  const tree = await page.default({ searchParams: Promise.resolve({ dataMode: "test", year: "2026", clubIds: "club-a" }) });
  const series = findElements(tree, Chart)[0].props.series as OverviewSeries[];
  assert.equal(series.length, 3);
  assert.deepEqual(series[2].questions, []);
  assert.equal(series[0].questions[0].sum, 25);
  assert.equal(series[0].questions[0].count, 5);
  assert.ok(!JSON.stringify(series).includes("private-response"));
  assert.ok(!JSON.stringify(series).includes("numericValue"));
  assert.ok(calls.every(where => where.includes("club-a")));
  if (role === "dmu") {
    assert.ok(calls.every(where => where.includes('"isTest":true')));
    assert.ok(calls.every(where => where.includes('"sentAt"')));
  }
});
