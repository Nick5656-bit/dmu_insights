import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTestModule, findElements } from "./test-module-loader";
import type { editUnusedQuestion, deleteUnusedQuestion, copyQuestion } from "./question-editing";
import type { lockUnusedTemplate } from "./template-editing";
import type { QuestionResult } from "./survey-results";
import type { SubmissionResult } from "./survey-submission";

const Widget = () => null;
const auth = { requireRole: async () => ({ role: "CLUB_ADMIN", clubId: "club-a" }), getSession: async () => ({ role: "CLUB_ADMIN", clubId: "club-a" }) };
const adapters = {
  "@/lib/auth": auth, "next/cache": { revalidatePath() {} },
  "@/components/survey-results-panel": { SurveyResultsPanel: Widget },
  "@/components/charts/benchmark-bar-chart": { BenchmarkBarChart: Widget, ClubComparisonChart: Widget },
  "@/components/club-multi-select-filter": { ClubMultiSelectFilter: Widget },
};
type Page = { default: (props: { searchParams: Promise<Record<string, string>> }) => Promise<unknown> };
const question = { id: "q", title: "Pilotspørgsmål", questionType: "SCALE_1_5", benchmarkKey: "SATISFACTION_OVERALL", options: [] };

for (const role of ["club", "dmu"]) test(`${role} dashboard and real result loader do not send small-group values to client components`, async () => {
  const prisma = {
    club: { findMany: async () => [], findUnique: async () => ({ isTest: false }) },
    surveyTemplate: { findMany: async () => [] },
    surveyInstance: { findMany: async () => [], count: async () => 1 },
    member: { count: async () => 20 },
    surveyResponse: { count: async () => 1 },
    surveyInvitation: { count: async () => 20 },
    question: { findMany: async () => [question] },
    surveyAnswer: { findMany: async () => [{ questionId: "q", surveyResponseId: "r1", numericValue: 1, optionValue: null, textValue: null }] },
  };
  const page = loadTestModule<Page>(`src/app/${role}/dashboard/page.tsx`, { ...adapters, "@/lib/prisma": { prisma } });
  const tree = await page.default({ searchParams: Promise.resolve({}) });
  const panels = findElements(tree, Widget).filter((element) => "results" in element.props);
  assert.equal(panels.length, 1);
  const results = panels[0].props.results as QuestionResult[];
  assert.equal(results[0].suppressed, true);
  assert.deepEqual(results[0].distribution, []);
  assert.equal(results[0].avg, null);
  assert.equal(results[0].count, 0);
  assert.ok(!JSON.stringify(panels[0].props).includes("r1"));
});

test("club export is scoped to its own club, includes choices/text and suppresses optional small groups", async () => {
  const whereSeen: unknown[] = [];
  const questions = [question, { ...question, id: "choice", questionType: "SINGLE_CHOICE", benchmarkKey: null, options: [{ label: "Ja", value: "yes" }] }, { ...question, id: "text", questionType: "TEXT" }];
  const answers = questions.flatMap((q) => Array.from({ length: q.id === "q" ? 1 : 5 }, (_, index) => ({ questionId: q.id, surveyResponseId: `r${index}`, numericValue: q.id === "q" ? 1 : null, optionValue: q.id === "choice" ? "yes" : null, textValue: q.id === "text" ? "God oplevelse" : null })));
  const prisma = {
    club: { findUnique: async () => ({ isTest: false }) },
    question: { findMany: async () => questions },
    surveyAnswer: { findMany: async ({ where }: { where: unknown }) => { whereSeen.push(where); return answers; } },
  };
  const route = loadTestModule<{ GET: (request: Request) => Promise<Response> }>("src/app/api/exports/results/route.ts", { ...adapters, "@/lib/prisma": { prisma } });
  const response = await route.GET(new Request("https://example.test/api/exports/results?clubIds=club-b&surveyInstanceId=s1"));
  assert.equal(response.status, 200);
  const csv = await response.text();
  assert.ok(csv.includes("Skjult: færre end 5 svar"));
  assert.ok(csv.includes('"Ja";"5"'));
  assert.ok(csv.includes("God oplevelse"));
  assert.ok(JSON.stringify(whereSeen).includes('"clubId":"club-a"'));
  assert.ok(!JSON.stringify(whereSeen).includes("club-b"));
  assert.ok(!csv.includes("surveyResponseId"));
});

test("server-side edit and delete guards reject used questions before any write", async () => {
  const operations: string[] = [];
  const tx = {
    $queryRaw: async () => { operations.push("lock"); },
    question: {
      findFirst: async () => ({ _count: { instanceQuestions: 1, answers: 0, templateQuestions: 0 } }),
      update: async () => { operations.push("update"); },
      delete: async () => { operations.push("delete"); },
    },
  };
  const loadedModule = loadTestModule<{ editUnusedQuestion: typeof editUnusedQuestion; deleteUnusedQuestion: typeof deleteUnusedQuestion }>("src/lib/question-editing.ts", { "@/lib/prisma": { prisma: { $transaction: async (run: (client: typeof tx) => unknown) => run(tx) } } });
  const result = await loadedModule.editUnusedQuestion("q", { scope: "DMU_STANDARD" }, { title: "Changed", description: null, questionType: "TEXT" }, []);
  assert.ok(result.error?.includes("låst"));
  await assert.rejects(() => loadedModule.deleteUnusedQuestion("q", { scope: "DMU_STANDARD" }));
  assert.deepEqual(operations, ["lock", "lock"]);
});

test("editing an unused question is atomic; a copy preserves options without editing its source", async () => {
  const writes: unknown[] = [];
  const source = { ...question, title: "Original", scope: "DMU_STANDARD", createdByClubId: null, description: null, _count: { instanceQuestions: 0, answers: 0 }, options: [{ label: "Ja", value: "yes", sortOrder: 1 }] };
  const tx = {
    $queryRaw: async () => [],
    question: { findFirst: async () => source, update: async (args: unknown) => { writes.push(args); }, create: async (args: unknown) => { writes.push(args); return { id: "copy" }; } },
  };
  const loadedModule = loadTestModule<{ editUnusedQuestion: typeof editUnusedQuestion; copyQuestion: typeof copyQuestion }>("src/lib/question-editing.ts", { "@/lib/prisma": { prisma: { $transaction: async (run: (client: typeof tx) => unknown) => run(tx) } } });
  assert.deepEqual(await loadedModule.editUnusedQuestion("q", { scope: "DMU_STANDARD" }, { title: "New", description: null, questionType: "SINGLE_CHOICE" }, ["Ældre", "Ældre?"]), {});
  assert.ok(JSON.stringify(writes[0]).includes("OPTION_1"));
  assert.ok(JSON.stringify(writes[0]).includes("deleteMany"));
  assert.equal((await loadedModule.copyQuestion("q", { scope: "DMU_STANDARD" })).id, "copy");
  assert.ok(JSON.stringify(writes[1]).includes("Original (kopi)"));
  assert.equal(source.title, "Original");
});

test("template guard locks the row and rejects even a draft instance", async () => {
  const loadedModule = loadTestModule<{ lockUnusedTemplate: typeof lockUnusedTemplate }>("src/lib/template-editing.ts", {});
  let locked = false;
  const tx = { $queryRaw: async () => { locked = true; }, surveyTemplate: { findUnique: async () => ({ _count: { surveyInstances: 1 } }) } };
  await assert.rejects(() => loadedModule.lockUnusedTemplate(tx as unknown as Parameters<typeof lockUnusedTemplate>[0], "t1"));
  assert.equal(locked, true);
});

test("populated member page passes a serializable confirmation string, not a server event handler", async () => {
  const SubmitButton = () => null;
  const prisma = {
    club: { findMany: async () => [{ id: "c1", name: "Testklub", _count: { members: 1 } }] },
    member: { findMany: async () => [{ id: "m1", name: "Testperson", email: "test@example.test", ageGroup: "AGE_18_30", raceClass: "MOTOCROSS", memberRole: "RIDER" }] },
  };
  const page = loadTestModule<Page>("src/app/dmu/members/page.tsx", { ...adapters, "@/lib/prisma": { prisma }, "@/components/submit-button": { SubmitButton } });
  const tree = await page.default({ searchParams: Promise.resolve({ clubId: "c1" }) });
  const remove = findElements(tree, SubmitButton).find((element) => element.props.confirmMessage);
  assert.equal(remove?.props.confirmMessage, "Fjern Testperson?");
  assert.equal(remove?.props.onClick, undefined);
});

test("real submission action returns errors without writing and commits valid responses only once", async () => {
  let writes = 0;
  let claimed = false;
  const invitation = {
    id: "i1", status: "OPENED", openedAt: new Date(), surveyInstanceId: "s1",
    surveyInstance: { status: "SENT", closesAt: null, clubId: "c1", surveyTemplate: { layoutJson: null }, surveyInstanceQuestions: [{ id: "sq", questionId: "q", required: true, question }] },
  };
  const tx = {
    surveyInvitation: { updateMany: async () => { if (claimed) return { count: 0 }; claimed = true; return { count: 1 }; } },
    surveyResponse: { create: async () => { writes++; return { id: "response1" }; } },
    surveyAnswer: { create: async () => { writes++; } },
  };
  const prisma = {
    surveyInvitation: { findFirst: async () => invitation },
    $transaction: async (run: (client: typeof tx) => unknown) => run(tx),
  };
  const page = loadTestModule<{ default: (props: { params: Promise<{ token: string }> }) => Promise<unknown> }>("src/app/survey/[token]/page.tsx", {
    ...adapters, "@/lib/prisma": { prisma }, "@/lib/survey-token": { hashSurveyToken: () => "hash" },
    "@/components/survey-wizard": { SurveyWizard: Widget },
  });
  const tree = await page.default({ params: Promise.resolve({ token: "synthetic-token" }) });
  const action = findElements(tree, Widget)[0].props.submitAction as (data: FormData) => Promise<SubmissionResult>;
  assert.ok((await action(new FormData())).error);
  assert.equal(writes, 0);
  const data = new FormData();
  data.set("segment_respondentAgeGroup", "AGE_18_30"); data.set("segment_respondentRole", "VOLUNTEER");
  assert.ok((await action(data)).error);
  assert.equal(writes, 0);
  data.set("question_q", "5");
  assert.deepEqual(await action(data), { success: true });
  assert.ok((await action(data)).error);
  assert.equal(writes, 2);
  invitation.surveyInstance.status = "CLOSED";
  assert.ok((await action(data)).error?.includes("lukket"));
  assert.equal(writes, 2);
});
