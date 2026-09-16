import assert from "node:assert/strict";
import test from "node:test";
import { loadTestModule } from "./test-module-loader";
import type * as Actions from "../app/dmu/templates/create-template-action";

const requestId = "f5fc3d94-4d9a-4f3c-a2b2-1c08e0122222";
const idle = { status: "idle" as const, message: "" };
function form(values: Record<string, string> = {}, ids = ["q2", "q1"]) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ requestId, name: "Testløb", description: "Beskrivelse", surveyType: "EVENT", ...values })) data.set(key, value);
  for (const id of ids) data.append("questionIds", id);
  return data;
}
function harness() {
  type Row = { id: string; name: string; description: string; surveyType: string; isActive: boolean;
    templateQuestions: { create: { questionId: string; sortOrder: number; required: boolean; isCoreBenchmarkQuestion: boolean }[] };
    layoutJson: { version: number; items: { questionId: string }[] } };
  const templates = new Map<string, Row>();
  const state = { role: "DMU_ADMIN", queries: 0, fail: false, missing: false, writes: 0 };
  const { createTemplateAction } = loadTestModule<typeof Actions>("src/app/dmu/templates/create-template-action.ts", {
    "@/lib/auth": { getSession: async () => state.role ? { role: state.role } : null },
    "next/cache": { revalidatePath() {} },
    "@/lib/prisma": { prisma: {
      question: { findMany: async ({ where }: { where: { active: boolean; scope: string } }) => {
        state.queries++;
        assert.equal(where.active, true); assert.equal(where.scope, "DMU_STANDARD");
        return state.missing ? [{ id: "q1", benchmarkKey: null }] : [{ id: "q1", benchmarkKey: null }, { id: "q2", benchmarkKey: "TRACK" }];
      } },
      surveyTemplate: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          state.queries++; const row = templates.get(where.id);
          return row ? { ...row, templateQuestions: row.templateQuestions.create } : null;
        },
        create: async ({ data }: { data: Row }) => {
          if (state.fail) throw new Error("Simulated nested write failure");
          if (templates.has(data.id)) throw new Error("Unique constraint");
          assert.equal(data.templateQuestions.create.length, data.layoutJson.items.length);
          templates.set(data.id, data); state.writes++; return data;
        },
      },
    } },
  });
  return { action: (data: FormData) => createTemplateAction(idle, data), state, templates };
}

test("template creation returns actionable validation errors without writes", async () => {
  const h = harness();
  for (const data of [form({ name: "ab" }), form({ name: "   " }), form({ description: " " }),
    form({ surveyType: "INVALID" }), form({ requestId: "wrong" }), form({}, [])]) {
    const result = await h.action(data);
    assert.equal(result.status, "error"); assert.ok(result.message.length > 10);
  }
  assert.equal(h.state.queries, 0); assert.equal(h.state.writes, 0);
});

test("template creation atomically includes selected order, flags and layout, as an unpublished draft", async () => {
  const h = harness();
  assert.equal((await h.action(form({}, ["q2", "q1", "q2"]))).status, "success");
  const row = h.templates.get(requestId)!;
  assert.equal(row.isActive, false);
  assert.deepEqual(row.templateQuestions.create.map(q => [q.questionId, q.sortOrder, q.required, q.isCoreBenchmarkQuestion]),
    [["q2", 1, true, true], ["q1", 2, true, false]]);
  assert.deepEqual(row.layoutJson.items.map(q => q.questionId), ["q2", "q1"]);
});

test("retries, including concurrent submissions, never create a second template", async () => {
  const h = harness();
  const results = await Promise.all([h.action(form()), h.action(form())]);
  assert.ok(results.some(result => result.status === "success"));
  assert.equal((await h.action(form())).status, "success");
  assert.equal(h.state.writes, 1); assert.equal(h.templates.size, 1);
  assert.equal((await h.action(form({ name: "Other contents" }))).status, "error");
});

test("database failure leaves no partial template and retry succeeds with same request ID", async () => {
  const h = harness(); h.state.fail = true;
  assert.equal((await h.action(form())).status, "error"); assert.equal(h.templates.size, 0);
  h.state.fail = false;
  assert.equal((await h.action(form())).status, "success"); assert.equal(h.templates.size, 1);
});

test("missing/inactive questions and unauthorized users cannot create templates", async () => {
  const h = harness(); h.state.missing = true;
  assert.equal((await h.action(form())).status, "error"); assert.equal(h.state.writes, 0);
  const before = h.state.queries;
  for (const role of ["", "CLUB_ADMIN"]) {
    h.state.role = role;
    assert.equal((await h.action(form())).status, "error");
  }
  assert.equal(h.state.queries, before);
});
