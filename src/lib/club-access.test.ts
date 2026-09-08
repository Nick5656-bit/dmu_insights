import assert from "node:assert/strict";
import test from "node:test";
import { findElements, loadTestModule } from "./test-module-loader";
import type * as Auth from "./auth";
import type { SessionPayload } from "./session";

type Row = Record<string, unknown>;
type Query = { where?: Row; select?: Row; take?: number };
type Page = { default: (props: { searchParams: Promise<Record<string, string>>; params: Promise<{ id: string }> }) => Promise<unknown> };
type Action = (data: FormData) => Promise<unknown>;
const Widget = () => null;
const object = (value: unknown): Row => (value && typeof value === "object" ? value as Row : {});

// Deliberately small query adapter, not a replacement for PostgreSQL integration tests.
// Both clubs are present on every query. Scope is applied from the ACTUAL page query,
// never from the current session. An omitted/undefined scope therefore exposes both.
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    if (key === "AND" || key === "OR") {
      const terms = Array.isArray(condition) ? condition : [condition];
      return key === "AND" ? terms.every(term => matches(row, object(term))) : terms.some(term => matches(row, object(term)));
    }
    const value = row[key];
    if (condition === null || typeof condition !== "object" || condition instanceof Date) return value === condition;
    const filter = object(condition);
    if ("some" in filter) return Array.isArray(value) && value.some(item => matches(object(item), object(filter.some)));
    if ("in" in filter) return (filter.in as unknown[]).includes(value);
    if ("notIn" in filter) return !(filter.notIn as unknown[]).includes(value);
    if ("not" in filter) return value !== filter.not;
    if ("gte" in filter || "lt" in filter) {
      if (!(value instanceof Date)) return false;
      return (!filter.gte || value >= (filter.gte as Date)) && (!filter.lt || value < (filter.lt as Date));
    }
    assert.ok(value && typeof value === "object", `Unsupported/missing relation: ${key}`);
    return matches(object(value), filter);
  });
}

function project(row: Row, select?: Row): Row {
  if (!select) return row;
  return Object.fromEntries(Object.entries(select).filter(([, field]) => field).map(([key, field]) => {
    const value = row[key];
    if (field === true || value == null || typeof value !== "object") return [key, value];
    const nested = object(field) as Query;
    return [key, Array.isArray(value)
      ? value.filter(item => matches(object(item), nested.where)).map(item => project(object(item), nested.select))
      : project(object(value), nested.select)];
  }));
}

function fixture() {
  const rows: Record<string, Row[]> = {};
  const writes: { model: string; operation: string; data: Row }[] = [];
  const queries: { model: string; where: Row | undefined }[] = [];
  const add = (model: string, row: Row) => { (rows[model] ??= []).push(row); return row; };
  for (const key of ["a", "b"]) {
    const club = add("club", { id: `club-${key}`, name: `Club ${key.toUpperCase()}`, active: true, isTest: true });
    const instance = add("surveyInstance", {
      id: `survey-${key}`, clubId: club.id, club, name: `Survey ${key.toUpperCase()}`, surveyType: "ANNUAL",
      surveyTemplateId: "template", surveyTemplate: { name: "Shared template" }, status: "DRAFT", clubReadyAt: null,
      createdAt: new Date(), sentAt: new Date(), scheduledSends: [], invitations: [], responses: [],
      _count: { responses: 5, invitations: 5 },
    });
    const question = add("question", {
      id: `question-${key}`, title: `Private question ${key.toUpperCase()}`, questionType: "TEXT",
      scope: "CLUB_CUSTOM", createdByClubId: club.id, options: [], description: null, benchmarkKey: null,
      _count: { instanceQuestions: 1, templateQuestions: 0, answers: 5 },
      instanceQuestions: [{ surveyInstance: instance }], answers: [],
    });
    add("question", { ...question, id: `unused-${key}`, instanceQuestions: [], answers: [],
      _count: { instanceQuestions: 0, templateQuestions: 0, answers: 0 } });
    add("surveyInstanceQuestion", { id: `link-${key}`, questionId: question.id, question, surveyInstanceId: instance.id,
      surveyInstance: instance, sourceType: "CLUB_ADDED", required: true, sortOrder: 1 });
    add("event", { id: `event-${key}`, clubId: club.id, title: `Private event ${key.toUpperCase()}`,
      eventDate: new Date(), eventType: "RACE", location: `Location ${key.toUpperCase()}`, surveyInstances: [] });
    add("member", { id: `member-${key}`, clubId: club.id, active: true, name: `Member ${key.toUpperCase()}`, email: `member-${key}@example.test` });
    add("clubExtraEmail", { id: `extra-${key}`, clubId: club.id, active: true, name: `Extra ${key.toUpperCase()}`, email: `extra-${key}@example.test` });
    for (let index = 0; index < 5; index++) {
      const response = add("surveyResponse", { id: `response-${key}-${index}`, clubId: club.id, surveyInstanceId: instance.id, surveyInstance: instance });
      add("surveyAnswer", { questionId: question.id, surveyResponseId: response.id, surveyResponse: response,
        numericValue: null, optionValue: null, textValue: `Private answer ${key.toUpperCase()} ${index}` });
    }
    const invitation = add("surveyInvitation", { id: `invitation-${key}`, surveyInstanceId: instance.id,
      surveyInstance: instance, status: "ANSWERED", deliveryStatus: "SENT", emailSnapshot: `member-${key}@example.test` });
    add("mailLog", { id: `mail-${key}`, surveyInvitation: invitation, status: "SENT", sentAt: new Date(),
      toEmail: `member-${key}@example.test`, subject: `Private mail ${key.toUpperCase()}`, bodyPreview: "Test only" });
  }
  rows.scheduledSend = [];
  rows.surveyTemplate = [];
  const db: Record<string, unknown> = {};
  for (const model of Object.keys(rows)) {
    const find = (query: Query = {}) => {
      queries.push({ model, where: query.where });
      return rows[model].filter(row => matches(row, query.where)).slice(0, query.take).map(row => project(row, query.select));
    };
    db[model] = {
      findMany: async (query: Query) => find(query),
      findFirst: async (query: Query) => find(query)[0] ?? null,
      findUnique: async (query: Query) => {
        // A detail page requests related questions; return a finite projection (no cycles).
        const found = find(query)[0];
        if (!found) return null;
        return model === "surveyInstance" && !query.select ? { ...found,
          surveyInstanceQuestions: rows.surveyInstanceQuestion.filter(link => link.surveyInstanceId === found.id)
            .map(({ surveyInstance: _instance, ...link }) => { void _instance; return link; }),
        } : found;
      },
      count: async (query: Query) => find(query).length,
      aggregate: async () => ({ _max: { sortOrder: 1 } }),
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = rows[model].find(item => matches(item, where));
        assert.ok(row, `Missing ${model} to update`);
        writes.push({ model, operation: "update", data });
        Object.assign(row, data, data.options ? { options: object(data.options).create } : {});
        return row;
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const selected = rows[model].filter(item => matches(item, where));
        for (const row of selected) { writes.push({ model, operation: "updateMany", data }); Object.assign(row, data); }
        return { count: selected.length };
      },
      delete: async ({ where }: { where: Row }) => {
        const index = rows[model].findIndex(item => matches(item, where));
        assert.ok(index >= 0); writes.push({ model, operation: "delete", data: where }); rows[model].splice(index, 1);
      },
      create: async ({ data }: { data: Row }) => {
        writes.push({ model, operation: "create", data }); return add(model, { id: `${model}-new`, ...data });
      },
    };
  }
  db.$transaction = async (callback: (tx: unknown) => Promise<unknown>) => callback(db);
  db.$queryRaw = async () => [];
  return { db, rows, writes, queries };
}

function harness(clubId: string | null = "club-a", role: SessionPayload["role"] = "CLUB_ADMIN") {
  const data = fixture();
  const current: { session: SessionPayload | null; allowLegacy: boolean } = { allowLegacy: true, session: { userId: "test-user", name: "Test admin", email: "admin@example.test", role, clubId, version: "test-version", exp: Math.floor(Date.now() / 1000) + 3600 } };
  const navigation = { redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); }, notFound: () => { throw new Error("NOT_FOUND"); } };
  const auth = loadTestModule<typeof Auth>("src/lib/auth.ts", {
    "next/headers": { cookies: async () => ({ get: () => current.session ? { value: "in-memory-token" } : undefined }) },
    "next/navigation": navigation,
    "@/lib/session": { sessionCookieName: "test-session", decryptSession: async () => current.session },
    "@/lib/session-version": { sessionVersion: () => "test-version" },
    "@/lib/prisma": { prisma: { user: { findUnique: async () => current.session ? {
      ...current.session, id: current.session.userId, passwordHash: "test-hash", club: { active: true },
    } : null } } },
  });
  const legacyGate = loadTestModule<{ requireLegacyClubRole: typeof auth.requireRole }>("src/lib/legacy-club-access.ts", {
    "@/lib/auth": auth, "next/navigation": navigation,
  });
  const overrides = {
    // Exercise retained code's ownership checks independently of the pilot gate.
    // Separate tests assert that the real gate denies pages AND actions.
    "@/lib/legacy-club-access": { requireLegacyClubRole: (role: SessionPayload["role"]) =>
      current.allowLegacy ? auth.requireRole(role) : legacyGate.requireLegacyClubRole(role) },
    "@/lib/auth": auth, "@/lib/prisma": { prisma: data.db }, "next/navigation": navigation,
    "next/cache": { revalidatePath() {} },
    "next/link": Widget,
    "@/lib/survey-token": { createSurveyToken: () => "test-only", hashSurveyToken: () => "test-only-hash" },
    "@/components/event-calendar": { EventCalendar: Widget },
    "@/components/survey-results-panel": { SurveyResultsPanel: Widget },
    "@/components/charts/benchmark-bar-chart": { BenchmarkBarChart: Widget, ClubComparisonChart: Widget },
    "@/components/club-multi-select-filter": { ClubMultiSelectFilter: Widget },
    "@/components/club-delivery-tabs": { ClubDeliveryTabs: Widget },
    "@/components/submit-button": { SubmitButton: Widget },
    "./club-question-create-form": { ClubQuestionCreateForm: Widget },
    "./club-question-edit-card": { ClubQuestionEditCard: Widget },
  };
  const page = (route: string, search: Record<string, string> = {}, id = "survey-a") =>
    loadTestModule<Page>(`src/app/${route}/page.tsx`, overrides).default({ searchParams: Promise.resolve(search), params: Promise.resolve({ id }) });
  const csv = async (search = "") => {
    const api = loadTestModule<{ GET: (request: Request) => Promise<Response> }>("src/app/api/exports/results/route.ts", overrides);
    return api.GET(new Request(`https://example.test/api/exports/results?${search}`));
  };
  return { ...data, current, page, csv };
}

function form(values: Record<string, string>) {
  const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data;
}
function action(tree: unknown, name: string): Action {
  const found = findElements(tree, "form").map(element => element.props.action).find(candidate => typeof candidate === "function" && candidate.name === name);
  assert.equal(typeof found, "function", `Missing action ${name}`); return found as Action;
}

test("pilot gate blocks legacy pages and retained server actions before data access", async () => {
  const h = harness();
  h.current.allowLegacy = false;
  for (const route of ["surveys", "surveys/[id]", "surveys/latest", "questions", "mail-log", "outbox"]) {
    await assert.rejects(h.page(`club/${route}`), /NOT_FOUND/);
  }
  assert.equal(h.queries.length, 0);
  // Simulate a previously rendered page; closing access must still block actions.
  h.current.allowLegacy = true;
  const tree = await h.page("club/surveys/[id]");
  h.current.allowLegacy = false;
  const reads = h.queries.length;
  for (const element of findElements(tree, "form")) {
    if (typeof element.props.action === "function") {
      await assert.rejects((element.props.action as Action)(form({ surveyInstanceId: "survey-a" })), /NOT_FOUND/);
    }
  }
  assert.equal(h.queries.length, reads);
  assert.equal(h.writes.length, 0);
});

for (const own of ["a", "b"]) {
  const other = own === "a" ? "b" : "a";
  test(`club ${own}: dashboard, calendar and mail pages only render own private data`, async () => {
    const h = harness(`club-${own}`);
    for (const route of ["dashboard", "events", "mail-log", "outbox", "overview", "questions"]) {
      const tree = await h.page(`club/${route}`, { show: "1" });
      const output = JSON.stringify(tree);
      assert.doesNotMatch(output, new RegExp(`Private (answer|question|event|mail) ${other.toUpperCase()}|member-${other}@example`), route);
      if (route === "events") assert.match(output, new RegExp(`Private event ${own.toUpperCase()}`));
      if (route === "dashboard") assert.match(output, new RegExp(`Private answer ${own.toUpperCase()}`));
      if (route === "mail-log") assert.match(output, new RegExp(`Private mail ${own.toUpperCase()}`));
      if (route === "outbox") assert.match(output, new RegExp(`member-${own}@example.test`));
    }
    assert.equal(h.writes.length, 0);
  });
  test(`club ${own}: foreign survey URL and tampered dashboard/mail filters do not expose club ${other}`, async () => {
    const h = harness(`club-${own}`);
    await assert.rejects(h.page("club/surveys/[id]", {}, `survey-${other}`), /NOT_FOUND/);
    assert.match(JSON.stringify(await h.page("club/surveys/[id]", {}, `survey-${own}`)), new RegExp(`Survey ${own.toUpperCase()}`));
    const dashboard = await h.page("club/dashboard", { surveyInstanceId: `survey-${other}` });
    assert.match(JSON.stringify(dashboard), /findes ikke i din klub/);
    for (const route of ["mail-log", "outbox"]) {
      const output = JSON.stringify(await h.page(`club/${route}`, { show: "1", surveyInstanceId: `survey-${other}` }));
      assert.doesNotMatch(output, /Private mail [AB]/);
      assert.doesNotMatch(output, new RegExp(`member-${other}@example.test`));
    }
  });
  test(`club ${own}: CSV ignores forged clubIds, rejects foreign instance data and retains own results`, async () => {
    const h = harness(`club-${own}`);
    const response = await h.csv(`clubIds=club-${other}&dataMode=pilot&year=all`);
    assert.equal(response.status, 200);
    const ownCsv = await response.text();
    assert.match(ownCsv, new RegExp(`Private answer ${own.toUpperCase()}`));
    assert.doesNotMatch(ownCsv, new RegExp(`Private (answer|question) ${other.toUpperCase()}`));
    const foreignCsv = await (await h.csv(`surveyInstanceId=survey-${other}&clubIds=club-${other}`)).text();
    assert.doesNotMatch(foreignCsv, /Private (answer|question) [AB]/);
    assert.doesNotMatch(ownCsv, /response-[ab]-|member-[ab]@/);
  });
}

test("DMU admin retains cross-club dashboard and export access and can narrow to one club", async () => {
  const h = harness(null, "DMU_ADMIN");
  const tree = await h.page("dmu/dashboard", { dataMode: "test", year: "all" });
  const csv = await (await h.csv("dataMode=test&year=all&clubIds=club-a,club-b")).text();
  for (const output of [JSON.stringify(tree), csv]) {
    assert.match(output, /Private answer A/); assert.match(output, /Private answer B/);
  }
  const narrowed = await (await h.csv("dataMode=test&year=all&clubIds=club-b")).text();
  assert.match(narrowed, /Private answer B/); assert.doesNotMatch(narrowed, /Private answer A/);
});

test("actual role guard rejects anonymous users and club users at the DMU dashboard", async () => {
  const h = harness();
  await assert.rejects(h.page("dmu/dashboard"), /REDIRECT:\/club\/overview/);
  assert.equal(h.queries.length, 0);
  h.current.session = null;
  await assert.rejects(h.page("club/dashboard"), /REDIRECT:\/login/);
  assert.equal((await h.csv()).status, 401);
  assert.equal(h.queries.length, 0);
});

test("club without membership cannot export or read dashboard results", async () => {
  const h = harness(null);
  assert.equal((await h.csv()).status, 401);
  await assert.rejects(h.page("club/dashboard"), /REDIRECT:\/login/);
  assert.equal(h.queries.length, 0);
});

test("club without membership must not see either club's calendar", async () => {
  const h = harness(null);
  await assert.rejects(h.page("club/events"), /REDIRECT:\/login/);
  assert.equal(h.queries.length, 0, "Fail closed before any database read");
});

test("question actions reject foreign edit/delete/copy; valid own actions still work", async () => {
  const h = harness();
  const tree = await h.page("club/questions");
  const props = findElements(tree, Widget).find(element => element.props.onEdit)?.props;
  assert.ok(props);
  const edit = props.onEdit as Action;
  const remove = props.onDelete as (id: string) => Promise<unknown>;
  const copy = props.onCopy as (id: string) => Promise<unknown>;
  const editData = { title: "Changed own question", questionType: "TEXT" };
  assert.ok(object(await edit(form({ ...editData, questionId: "unused-b" }))).error);
  await assert.rejects(remove("unused-b"), /ikke adgang/);
  await assert.rejects(copy("unused-b"), /ikke adgang/);
  assert.equal(h.writes.length, 0);
  assert.deepEqual(await edit(form({ ...editData, questionId: "unused-a" })), {});
  await copy("unused-a"); await remove("unused-a");
  assert.deepEqual(h.writes.map(write => write.operation), ["update", "create", "delete"]);
  assert.equal(h.rows.question.find(row => row.id === "question-b")?.title, "Private question B");
});

test("recipient removal cannot deactivate another club's email; own removal succeeds", async () => {
  const h = harness();
  const remove = action(await h.page("club/mail-log"), "removeExtraEmailAction");
  await remove(form({ extraEmailId: "extra-b", clubId: "club-b" }));
  assert.equal(h.writes.length, 0);
  await remove(form({ extraEmailId: "extra-a" }));
  assert.equal(h.rows.clubExtraEmail.find(row => row.id === "extra-a")?.active, false);
  assert.equal(h.rows.clubExtraEmail.find(row => row.id === "extra-b")?.active, true);
});

for (const actionName of ["sendSurveyNowAction", "scheduleSurveySendAction", "addCustomQuestionAction", "addExistingCustomQuestionAction", "removeCustomQuestionAction", "updateReadyStateAction"]) {
  test(`tampered ${actionName} cannot change club B's survey`, async () => {
    const h = harness();
    if (actionName === "updateReadyStateAction") {
      for (const row of h.rows.surveyInstance) row.surveyType = "EVENT";
    }
    const tree = await h.page("club/surveys/[id]");
    const invoke = action(tree, actionName);
    await invoke(form({ surveyInstanceId: "survey-b", surveyInstanceQuestionId: "link-b", questionId: "question-b",
      title: "Tampered question", questionType: "TEXT", sendAt: "2099-01-01T12:00", intent: "ready", clubId: "club-b" }));
    assert.equal(h.writes.length, 0);
  });
}

test("cannot attach B's question to A's survey; own question addition and removal work", async () => {
  const h = harness();
  // The composite lookup below is an explicit adapter for this unique Prisma key.
  const links = h.db.surveyInstanceQuestion as { findUnique: (query: Query) => Promise<unknown> };
  const original = links.findUnique;
  links.findUnique = async (query) => query.where?.surveyInstanceId_questionId
    ? h.rows.surveyInstanceQuestion.find(row => matches(row, object(query.where?.surveyInstanceId_questionId))) ?? null
    : original(query);
  const tree = await h.page("club/surveys/[id]");
  const add = action(tree, "addExistingCustomQuestionAction");
  await add(form({ surveyInstanceId: "survey-a", questionId: "question-b" }));
  assert.equal(h.writes.length, 0);
  await add(form({ surveyInstanceId: "survey-a", questionId: "unused-a" }));
  assert.equal(h.writes[0].data.questionId, "unused-a");
  await action(tree, "removeCustomQuestionAction")(form({ surveyInstanceQuestionId: "link-a" }));
  assert.ok(h.rows.surveyInstanceQuestion.some(row => row.id === "link-b"));
  assert.ok(!h.rows.surveyInstanceQuestion.some(row => row.id === "link-a"));
});

test("server actions recheck session after page render, not only at initial page access", async () => {
  const h = harness();
  const tree = await h.page("club/mail-log");
  h.current.session = null;
  await assert.rejects(action(tree, "removeExtraEmailAction")(form({ extraEmailId: "extra-a" })), /REDIRECT:\/login/);
  assert.equal(h.writes.length, 0);
});
