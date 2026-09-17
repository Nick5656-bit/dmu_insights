import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDashboardYear, parseSelectionIds } from "./dashboard-filters";
import { loadTestModule, findElements } from "./test-module-loader";
import { summarizeQuestion } from "./survey-results";
import type { OverviewSeries } from "./result-overview";

test("filter parser accepts old links and repeated form values, defaults to all years", () => {
  assert.deepEqual(parseSelectionIds(["a,b", " a ", "c", ""]), ["a", "b", "c"]);
  assert.deepEqual(parseSelectionIds(undefined), []);
  assert.equal(parseDashboardYear(undefined), null);
  assert.equal(parseDashboardYear("all"), null);
  assert.equal(parseDashboardYear("2026"), 2026);
});

for (const role of ["club", "dmu"] as const) for (const ids of [[], ["a"], ["a", "b"], ["a", "foreign"]]) {
  test(`${role}: ${ids.length} explicit events share the scope between chart, distribution and CSV`, async () => {
    const Chart = () => null, Panel = () => null, Picker = () => null;
    const queries: { response: Record<string, unknown>; instance: Record<string, unknown> }[] = [];
    const q = { id: "q", title: "Sikkerhed", questionType: "SCALE_1_5" as const, benchmarkKey: "SAFETY_Q", options: [] };
    const result = summarizeQuestion(q, Array.from({ length: 6 }, (_, i) => ({ surveyResponseId: String(i), numericValue: 4, textValue: null, optionValue: null })));
    let comparisonLoads = 0;
    const overrides = {
      "@/lib/auth": { requireRole: async () => ({ clubId: "club-a" }), getSession: async () => ({ role: role === "club" ? "CLUB_ADMIN" : "DMU_ADMIN", clubId: "club-a" }) },
      "@/lib/prisma": { prisma: {
        club: { findUnique: async () => ({ isTest: true }), findMany: async () => [{ id: "club-a", name: "Club A" }] },
        surveyTemplate: { findMany: async () => [] },
        surveyInstance: { findMany: async () => ["a", "b"].map(id => ({ id, name: id, club: { name: "Club A" } })), count: async () => 2 },
        member: { count: async () => 10 }, surveyInvitation: { count: async () => 10 }, surveyResponse: { count: async () => 6 },
      } },
      "@/lib/survey-results.server": { loadSurveyResults: async (response: Record<string, unknown>, instance: Record<string, unknown>) => { queries.push({ response, instance }); return [result]; } },
      "@/lib/result-overview.server": { loadResultOverview: async (response: Record<string, unknown>, instance: Record<string, unknown>) => {
        comparisonLoads++; queries.push({ response, instance });
        return ids.map(id => ({ id, label: id, questions: [{ id: "q", title: "Sikkerhed", category: "Sikkerhed", sum: 24, count: 6 }] }));
      } },
      "@/components/charts/result-overview-chart": { ResultOverviewChart: Chart },
      "@/components/survey-results-panel": { SurveyResultsPanel: Panel },
      "@/components/club-multi-select-filter": { ClubMultiSelectFilter: Picker },
    };
    const page = loadTestModule<{ default: (props: { searchParams: Promise<Record<string, string | string[]>> }) => Promise<unknown> }>(`src/app/${role}/dashboard/page.tsx`, overrides);
    const tree = await page.default({ searchParams: Promise.resolve({ surveyInstanceId: ids, dataMode: "test", clubIds: "club-a", respondentAgeGroup: "AGE_18_30" }) });
    if (ids.includes("foreign")) {
      assert.equal(findElements(tree, Chart).length, 0);
      assert.ok(findElements(tree, "p").some(p => p.props.role === "alert"));
      assert.equal(queries.length, 0);
      return;
    }
    const chart = findElements(tree, Chart)[0];
    assert.equal(chart.props.comparison, ids.length > 1);
    assert.equal(comparisonLoads, ids.length > 1 ? 1 : 0);
    const series = chart.props.series as OverviewSeries[];
    assert.equal(series.length, ids.length > 1 ? 2 : 1);
    assert.equal(series[0].label, ids.length ? "a" : "Samlede resultater");
    assert.equal(series[0].questions[0].count, 6);
    assert.ok(findElements(tree, Picker).some(p => p.props.inputName === "surveyInstanceId"));
    const exportHref = findElements(tree, "a").find(a => String(a.props.href).startsWith("/api/exports/results"))!.props.href as string;
    const url = new URL(exportHref, "https://example.test");
    assert.deepEqual(url.searchParams.getAll("surveyInstanceId"), ids);
    const route = loadTestModule<{ GET: (r: Request) => Promise<Response> }>("src/app/api/exports/results/route.ts", overrides);
    assert.equal((await route.GET(new Request(url))).status, 200);
    for (const { response, instance } of queries) {
      assert.deepEqual(instance.id, ids.length ? { in: ids } : undefined);
      assert.equal(response.respondentAgeGroup, "AGE_18_30");
      assert.deepEqual(instance.clubId, role === "club" ? "club-a" : { in: ["club-a"] });
      assert.equal(instance.OR, undefined); // All years is also the export default.
      if (role === "dmu") assert.deepEqual(instance.club, { isTest: true });
    }
  });
}
