import assert from "node:assert/strict";
import { test } from "node:test";
import { pilotUserSchema, pilotClubSchema } from "./pilot-setup";
import { loadTestModule, findElements } from "./test-module-loader";
import type * as Provisioning from "../app/dmu/settings/pilot/actions";
import type { processDataRetention } from "./data-retention";

test("pilot provisioning validates email, explicit data mode and bcrypt byte limit", () => {
  const user = { name: "Test Admin", email: " ADMIN@EXAMPLE.TEST ", password: "Synthetic-password-123" };
  assert.equal(pilotUserSchema.parse(user).email, "admin@example.test");
  assert.equal(pilotUserSchema.safeParse({ ...user, password: "demo1234" }).success, false);
  assert.equal(pilotUserSchema.safeParse({ ...user, password: "ø".repeat(40) }).success, false);
  assert.equal(pilotClubSchema.safeParse({ ...user, clubName: "Club", city: "Aarhus" }).success, false);
  assert.equal(pilotClubSchema.safeParse({ ...user, clubName: "Club", city: "Aarhus", dataMode: "test" }).success, true);
});

function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ name: "Synthetic Admin", email: "ADMIN@example.test", password: "Synthetic-password-123", clubName: "Synthetic Club", city: "Test", dataMode: "test" })) data.set(key, value);
  return data;
}

test("provisioning enforces DMU role, creates club/user atomically and never overwrites a duplicate", async () => {
  const calls: { data: { users: { create: { passwordHash: string; email: string; role: string } }; isTest: boolean } }[] = [];
  let allowed = true, duplicate = false, hashes = 0;
  const api = loadTestModule<typeof Provisioning>("src/app/dmu/settings/pilot/actions.ts", {
    "@/lib/auth": { requireRole: async (role: string) => { assert.equal(role, "DMU_ADMIN"); if (!allowed) throw Error("Forbidden"); } },
    "next/cache": { revalidatePath() {} },
    bcryptjs: { hash: async () => { hashes++; return "hashed-not-a-real-password"; } },
    "@/lib/prisma": { prisma: { club: { create: async (args: typeof calls[number]) => { if (duplicate) throw { code: "P2002" }; calls.push(args); } }, user: { create: async () => { throw Error("Must use nested create"); } } } },
  });
  const initial = { success: false, message: "" };
  assert.equal((await api.createPilotClub(initial, form())).success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].data.isTest, true);
  assert.equal(calls[0].data.users.create.role, "CLUB_ADMIN");
  assert.equal(calls[0].data.users.create.email, "admin@example.test");
  assert.ok(!JSON.stringify(calls).includes("Synthetic-password-123"));
  duplicate = true;
  assert.equal((await api.createPilotClub(initial, form())).success, false);
  assert.equal(calls.length, 1);
  allowed = false;
  await assert.rejects(() => api.createPilotClub(initial, form()), /Forbidden/);
  await assert.rejects(() => api.createPersonalDmuAdmin(initial, form()), /Forbidden/);
  assert.equal(hashes, 2);
});

for (const isTest of [false, true]) test(`DMU dashboard + exports keep ${isTest ? "test" : "pilot"} data separate in every result query`, async () => {
  const calls: { surveyInstance: { club?: { isTest: boolean } } }[] = [];
  const clubsSeen: unknown[] = [];
  const Panel = () => null;
  const prisma = {
    club: { findMany: async ({ where }: { where: unknown }) => { clubsSeen.push(where); return []; } },
    surveyTemplate: { findMany: async () => [] },
    surveyResponse: { count: async () => 0 },
    question: { findMany: async () => [] },
    surveyAnswer: { findMany: async ({ where }: { where: { surveyResponse: typeof calls[number] } }) => { calls.push(where.surveyResponse); return []; } },
  };
  const overrides = {
    "@/lib/prisma": { prisma }, "@/lib/auth": { requireRole: async () => ({ role: "DMU_ADMIN" }), getSession: async () => ({ role: "DMU_ADMIN" }) },
    "@/components/survey-results-panel": { SurveyResultsPanel: Panel },
    "@/components/charts/benchmark-bar-chart": { ClubComparisonChart: () => null },
    "@/components/club-multi-select-filter": { ClubMultiSelectFilter: () => null },
  };
  const dataMode = isTest ? "test" : "pilot";
  const page = loadTestModule<{ default: (props: { searchParams: Promise<{ dataMode: string }> }) => Promise<unknown> }>("src/app/dmu/dashboard/page.tsx", overrides);
  const tree = await page.default({ searchParams: Promise.resolve({ dataMode }) });
  assert.equal(findElements(tree, Panel).length, 1);
  const route = loadTestModule<{ GET: (request: Request) => Promise<Response> }>("src/app/api/exports/results/route.ts", overrides);
  assert.equal((await route.GET(new Request(`https://example.test/api/exports/results?dataMode=${dataMode}`))).status, 200);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((where) => where.surveyInstance.club?.isTest === isTest));
  assert.deepEqual(clubsSeen, [{ active: true, isTest }]);
});

test("test club benchmarks can never include a real pilot club", async () => {
  const resultScopes: { club?: { isTest: boolean }; clubId: unknown }[] = [];
  const prisma = {
    club: { findUnique: async () => ({ isTest: true }) },
    surveyInstance: { findMany: async () => [{ id: "s", name: "Test", surveyTemplateId: "t", sentAt: new Date("2026-09-01"), _count: { responses: 0 } }], count: async () => 1 },
    member: { count: async () => 0 }, surveyResponse: { count: async () => 0 }, surveyInvitation: { count: async () => 0 },
  };
  const page = loadTestModule<{ default: (props: { searchParams: Promise<{ surveyInstanceId: string }> }) => Promise<unknown> }>("src/app/club/dashboard/page.tsx", {
    "@/lib/prisma": { prisma }, "@/lib/auth": { requireRole: async () => ({ role: "CLUB_ADMIN", clubId: "test-club" }) },
    "@/lib/survey-results.server": { loadSurveyResults: async (_responses: unknown, instances: typeof resultScopes[number]) => { resultScopes.push(instances); return []; } },
    "@/components/survey-results-panel": { SurveyResultsPanel: () => null },
    "@/components/charts/benchmark-bar-chart": { BenchmarkBarChart: () => null },
  });
  await page.default({ searchParams: Promise.resolve({ surveyInstanceId: "s" }) });
  const comparison = resultScopes.find((where) => typeof where.clubId === "object");
  assert.deepEqual(comparison?.club, { isTest: true });
});

test("retention only deletes shared event participants after ALL surveys pass retention, including previously redacted events", async () => {
  let participantWhere: unknown;
  const prisma = {
    surveyInstance: { findMany: async () => [] },
    eventParticipant: { deleteMany: async ({ where }: { where: unknown }) => { participantWhere = where; return { count: 0 }; } },
  };
  const api = loadTestModule<{ processDataRetention: typeof processDataRetention }>("src/lib/data-retention.ts", { "@/lib/prisma": { prisma } });
  await api.processDataRetention();
  const where = participantWhere as { event: { surveyInstances: { some: object; every: { status: string; closesAt: { not: null; lte: Date } } } } };
  assert.deepEqual(where.event.surveyInstances.some, {});
  assert.equal(where.event.surveyInstances.every.status, "CLOSED");
  assert.equal(where.event.surveyInstances.every.closesAt.not, null);
  assert.ok(where.event.surveyInstances.every.closesAt.lte < new Date());
});
