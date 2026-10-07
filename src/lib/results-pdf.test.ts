import assert from "node:assert/strict";
import test from "node:test";
import { loadTestModule } from "./test-module-loader";
import { summarizeQuestion } from "./survey-results";
import { renderResultsPdf, type ResultsPdfInput } from "./results-pdf";

type Route = { GET: (request: Request) => Promise<Response> };

for (const role of ["CLUB_ADMIN", "DMU_ADMIN"]) for (const ids of [[], ["one"], ["one", "two"]]) {
  test(`PDF ${role}: ${ids.length} selections preserve all filters and protected results`, async () => {
    const queries: Array<{ response: Record<string, unknown>; instance: Record<string, unknown> }> = [];
    let report: ResultsPdfInput | undefined;
    const protectedResult = summarizeQuestion({ id: "q", title: "Spørgsmål", questionType: "TEXT", benchmarkKey: null, options: [] },
      Array.from({ length: 4 }, (_, i) => ({ surveyResponseId: String(i), numericValue: null, optionValue: null, textValue: "PRIVATE-ANSWER" })));
    const route = loadTestModule<Route>("src/app/api/exports/results/route.ts", {
      "@/lib/auth": { getSession: async () => ({ role, clubId: "own-club" }) },
      "@/lib/prisma": { prisma: {
        club: { findUnique: async () => ({ isTest: true }) },
        surveyInstance: { findMany: async ({ where }: { where: Record<string, unknown> }) => {
          assert.deepEqual(where.clubId, role === "CLUB_ADMIN" ? "own-club" : { in: ["selected-club"] });
          return (ids.length ? ids : ["one", "two"]).map(id => ({ id, name: id, club: { name: "Tilladt klub" } }));
        } },
      } },
      "@/lib/survey-results.server": { loadSurveyResults: async (response: Record<string, unknown>, instance: Record<string, unknown>) => { queries.push({ response, instance }); return [protectedResult]; } },
      "@/lib/result-overview.server": { loadResultOverview: async (response: Record<string, unknown>, instance: Record<string, unknown>) => { queries.push({ response, instance }); return []; } },
      "@/lib/results-pdf": { renderResultsPdf: async (value: ResultsPdfInput) => { report = value; return Buffer.from("%PDF-1.3\nfixture"); } },
    });
    const params = new URLSearchParams({ format: "pdf", clubIds: "selected-club", dataMode: "test", year: "2026", surveyTemplateId: "template", respondentAgeGroup: "AGE_18_30", respondentRole: "RIDER", motocrossClass: "A_MX1" });
    ids.forEach(id => params.append("surveyInstanceId", id));
    const response = await route.GET(new Request(`https://example.test/api/exports/results?${params}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.match(response.headers.get("content-disposition")!, /attachment;.*\.pdf/);
    assert.equal(report!.comparison, ids.length > 1);
    assert.deepEqual(report!.results[0].texts, []);
    assert.equal(report!.results[0].count, 0);
    assert.ok(!JSON.stringify(report).includes("PRIVATE-ANSWER"));
    assert.ok(report!.filters.some(label => label.includes("18–30 år")));
    assert.ok(report!.filters.some(label => label.includes("Aktiv kører")));
    for (const { response, instance } of queries) {
      assert.equal(response.respondentAgeGroup, "AGE_18_30");
      assert.equal(response.respondentRole, "RIDER");
      assert.equal(response.motocrossClass, "A_MX1");
      assert.deepEqual(instance.id, ids.length ? { in: ids } : undefined);
      assert.deepEqual(instance.clubId, role === "CLUB_ADMIN" ? "own-club" : { in: ["selected-club"] });
      assert.equal(instance.surveyTemplateId, role === "CLUB_ADMIN" ? undefined : "template");
      if (role === "DMU_ADMIN") { assert.deepEqual(instance.club, { isTest: true }); assert.ok(instance.OR); }
      else assert.equal(instance.OR, undefined);
    }
  });
}

test("PDF export rejects missing membership, anonymous sessions and inaccessible events", async () => {
  for (const session of [null, { role: "CLUB_ADMIN", clubId: null }, { role: "MEMBER" }]) {
    const route = loadTestModule<Route>("src/app/api/exports/results/route.ts", {
      "@/lib/auth": { getSession: async () => session }, "@/lib/prisma": { prisma: {} },
    });
    assert.equal((await route.GET(new Request("https://example.test/api/exports/results?format=pdf"))).status, session ? 403 : 401);
  }
  let rendered = false;
  const route = loadTestModule<Route>("src/app/api/exports/results/route.ts", {
    "@/lib/auth": { getSession: async () => ({ role: "CLUB_ADMIN", clubId: "own" }) },
    "@/lib/prisma": { prisma: { club: { findUnique: async () => ({ isTest: false }) }, surveyInstance: { findMany: async () => [] } } },
    "@/lib/survey-results.server": { loadSurveyResults: async () => [] },
    "@/lib/results-pdf": { renderResultsPdf: async () => { rendered = true; } },
  });
  assert.equal((await route.GET(new Request("https://example.test/api/exports/results?format=pdf&surveyInstanceId=foreign"))).status, 400);
  assert.equal(rendered, false);
});

test("PDF renderer creates a real PDF with embedded fonts and an empty-state report", async () => {
  const pdf = await renderResultsPdf({ scope: "Ærø - Østsjælland", filters: ["Alle aldre"], results: [], series: [], comparison: false });
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.match(pdf.toString("latin1"), /\/FontFile2/);
  assert.ok(pdf.length > 10000);
});
