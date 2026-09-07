import assert from "node:assert/strict";
import { test } from "node:test";
import { MAIL_WINDOW_MS, automaticSendWindow, hasAutomaticSendWindow, mailFailure, mailLimit } from "./mail-policy";
import { loadTestModule } from "./test-module-loader";
import type * as Budget from "./mail-budget";
import type * as Delivery from "./invitation-delivery";
import type * as Scheduled from "./scheduled-sends";

test("free-plan limit cannot be raised above 300; zero pauses sending", () => {
  assert.equal(mailLimit("999"), 300);
  assert.equal(mailLimit("50"), 50);
  assert.equal(mailLimit("0"), 0);
});

test("automatic window is UTC-based across Danish summer/winter time, and cannot fall after closure", () => {
  for (const date of ["2026-07-01", "2026-12-01"]) {
    const window = automaticSendWindow(new Date(`${date}T15:00:00Z`));
    assert.equal(window.start.toISOString(), `${date}T16:00:00.000Z`);
    assert.equal(window.end.toISOString(), `${date}T17:00:00.000Z`);
    const label = new Intl.DateTimeFormat("da-DK", { hour: "2-digit", timeZone: "Europe/Copenhagen" }).format(window.start);
    assert.equal(label, date.includes("07") ? "18" : "17");
  }
  assert.equal(automaticSendWindow(new Date("2026-09-07T16:01:00Z")).start.toISOString(), "2026-09-08T16:00:00.000Z");
  assert.equal(hasAutomaticSendWindow(new Date("2026-09-07T15:00Z"), new Date("2026-09-07T16:30Z"), new Date("2026-09-07T14:00Z")), false);
});

test("provider quota/auth errors pause the account; ambiguous responses are not automatically retried", () => {
  assert.deepEqual(mailFailure(400, "not_enough_credits"), { retryable: true, quotaBlocked: true });
  assert.deepEqual(mailFailure(401, null), { retryable: true, accountBlocked: true });
  assert.deepEqual(mailFailure(429, null), { retryable: true });
  assert.deepEqual(mailFailure(400, "invalid_parameter"), { retryable: false });
  assert.deepEqual(mailFailure(503, null), { retryable: false, uncertain: true });
});

test("mail budget serializes competing reservations, includes legacy sends, and leaves unclaimed items pending", async () => {
  const stamps: { createdAt: Date }[] = [];
  const legacy = Array.from({ length: 298 }, () => ({ sentAt: new Date() }));
  const claimed = new Set<string>();
  let locked = false;
  const client = {
    $queryRaw: async () => { locked = true; },
    mailSendReservation: { findMany: async () => stamps, create: async () => { assert.equal(locked, true); stamps.push({ createdAt: new Date() }); } },
    mailSendControl: { findUnique: async () => null },
    mailLog: { findMany: async () => legacy },
    surveyInvitation: { updateMany: async ({ where }: { where: { id: string } }) => { assert.equal(locked, true); if (claimed.has(where.id)) return { count: 0 }; claimed.add(where.id); return { count: 1 }; } },
  };
  // The in-memory adapter models transactions serialised by PostgreSQL's shared advisory lock.
  let tail: Promise<unknown> = Promise.resolve();
  const prisma = { ...client, $transaction: (run: (tx: typeof client) => Promise<unknown>) => {
    const result = tail.then(async () => { locked = false; return run(client); }); tail = result; return result;
  } };
  const api = loadTestModule<typeof Budget>("src/lib/mail-budget.ts", { "@/lib/prisma": { prisma } });
  const result = await Promise.all(Array.from({ length: 20 }, (_, i) => api.claimMailDelivery({ id: `i${i}` }, { deliveryStatus: "SENDING" })));
  assert.equal(result.filter((r) => r.claimed).length, 2);
  assert.equal(stamps.length, 2);
  assert.equal(claimed.size, 2);
  const budget = await api.readMailBudget();
  assert.equal(budget.used, 300); assert.equal(budget.remaining, 0);
  assert.ok(budget.retryAt.getTime() >= legacy[0].sentAt.getTime() + MAIL_WINDOW_MS);
});

function queueHarness(result: unknown = { success: true }, quota = false) {
  let sends = 0;
  const updates: unknown[] = [], queries: unknown[] = [], logs: unknown[] = [], pauses: Date[] = [];
  const candidate = { id: "i", emailSnapshot: "synthetic@example.test", tokenCiphertext: "encrypted", deliveryAttempts: 0, reminderAttempts: 0,
    surveyInstance: { name: "Test", closesAt: null, surveyType: "EVENT" } };
  const client = {
    surveyInvitation: { findMany: async (args: unknown) => { queries.push(args); return [candidate]; },
      updateMany: async (args: unknown) => { updates.push(args); return { count: 0 }; },
      update: async (args: unknown) => { updates.push(args); } },
    mailLog: { create: async (args: unknown) => { logs.push(args); } },
  };
  const api = loadTestModule<typeof Delivery>("src/lib/invitation-delivery.ts", {
    "@/lib/prisma": { prisma: { ...client, $transaction: async (run: (tx: typeof client) => unknown) => run(client) } },
    "@/lib/survey-token": { decryptSurveyToken: () => "synthetic-token" },
    "@/lib/email": { sendSurveyInvitation: async () => { sends++; return result; } },
    "@/lib/mail-budget": { claimMailDelivery: async () => ({ claimed: !quota, quota, retryAt: new Date(Date.now() + MAIL_WINDOW_MS) }), pauseMailAccount: async (date: Date) => { pauses.push(date); } },
  });
  return { api, updates, queries, logs, pauses, sent: () => sends };
}

test("quota exhaustion does not call Brevo or increment attempts and retains the selected scope", async () => {
  const h = queueHarness(undefined, true);
  const result = await h.api.processPendingInvitationDeliveries({ surveyInstanceIds: ["only-this-survey"] });
  assert.equal(h.sent(), 0); assert.equal(result.attemptedCount, 0); assert.equal(result.quotaDeferredCount, 1);
  assert.ok(JSON.stringify(h.queries[0]).includes('"surveyInstanceId":{"in":["only-this-survey"]}'));
  assert.ok(!JSON.stringify(h.updates).includes('"increment"'));
  assert.equal(h.logs.length, 0);
});

test("Brevo quota failure stays pending, does not exhaust retries, and pauses all workers", async () => {
  const h = queueHarness({ success: false, error: "No credits", retryable: true, quotaBlocked: true });
  const result = await h.api.processPendingInvitationDeliveries();
  assert.equal(result.retryScheduledCount, 1); assert.equal(result.permanentlyFailedCount, 0);
  assert.equal(h.pauses.length, 1);
  assert.ok(JSON.stringify(h.updates).includes('"deliveryAttempts":{"decrement":1}'));
  assert.ok(JSON.stringify(h.updates).includes('"deliveryStatus":"PENDING"'));
  assert.ok(JSON.stringify(h.logs).includes('"quotaTracked":true'));
});

test("ambiguous send requires review; accepted sends do not overwrite OPENED/ANSWERED", async () => {
  const failed = queueHarness({ success: false, error: "Unknown", retryable: false, uncertain: true });
  assert.equal((await failed.api.processPendingInvitationDeliveries()).reviewCount, 1);
  assert.ok(JSON.stringify(failed.updates).includes('"deliveryStatus":"FAILED"'));
  const accepted = queueHarness();
  assert.equal((await accepted.api.processPendingInvitationDeliveries()).deliveredCount, 1);
  const statuses = accepted.updates as { where: { id?: string; status?: string }; data: { status?: string } }[];
  assert.ok(statuses.filter((u) => u.data.status === "SENT").every((u) => u.where.status === "CREATED"));
});

test("reminders share the budget and are selected only for unanswered, open surveys with a 24-hour buffer", async () => {
  const h = queueHarness(undefined, true);
  await h.api.processDueSurveyReminders();
  assert.equal(h.sent(), 0);
  const query = h.queries[0] as { where: { status: { in: string[] }; surveyInstance: { status: string; OR: { closesAt: { gt: Date } | null }[] } } };
  assert.deepEqual(query.where.status.in, ["SENT", "OPENED"]);
  assert.equal(query.where.surveyInstance.status, "SENT");
  assert.ok(query.where.surveyInstance.OR[1].closesAt!.gt.getTime() > Date.now() + 23 * 3600_000);
});

test("manual schedule scope is fail-closed; no manual call runs reminder processing", async () => {
  for (const selected of [[], ["chosen"]]) {
    const queries: unknown[] = [], deliveries: unknown[] = [];
    let reminders = 0;
    const prisma = {
      scheduledSend: { findMany: async (args: unknown) => { queries.push(args); return selected.length ? [{ id: "chosen", surveyInstanceId: "survey", status: "PROCESSED", sendAt: new Date(0) }] : []; } },
      surveyInstance: { updateMany: async (args: unknown) => { queries.push(args); return { count: 0 }; } },
      surveyInvitation: { count: async () => 0 },
    };
    const api = loadTestModule<typeof Scheduled>("src/lib/scheduled-sends.ts", {
      "@/lib/prisma": { prisma }, "@/lib/survey-token": {},
      "@/lib/invitation-delivery": { emptyDeliveryCounters: () => ({}), processPendingInvitationDeliveries: async (scope: unknown) => { deliveries.push(scope); return {}; }, processDueSurveyReminders: async () => { reminders++; return {}; } },
    });
    await api.processDueScheduledSends(selected);
    assert.equal(reminders, 0);
    assert.deepEqual((deliveries[0] as { surveyInstanceIds: string[] }).surveyInstanceIds, selected.length ? ["survey"] : []);
    assert.deepEqual((queries[0] as { where: unknown }).where, { id: { in: selected } });
  }
});

test("overlapping schedules for one survey prepare recipients only once, with normalized email deduplication", async () => {
  let state = "SCHEDULED", created = 0, locks = 0;
  const schedules = ["one", "two"].map((id) => ({ id, surveyInstanceId: "survey", status: "PENDING", sendAt: new Date(0) }));
  const tx = {
    $queryRaw: async (sql: TemplateStringsArray) => { assert.ok(sql.join("").includes("FOR UPDATE OF s, d")); locks++; },
    scheduledSend: {
      findFirst: async () => state === "SCHEDULED" ? { surveyInstance: { id: "survey", surveyType: "EVENT", eventId: "event", sentAt: null, invitations: [] } } : null,
      update: async () => ({}),
    },
    eventParticipant: { findMany: async () => [{ id: "p1", email: "SAME@example.test" }, { id: "p2", email: "same@example.test " }] },
    surveyInvitation: { createMany: async ({ data }: { data: { emailSnapshot: string }[] }) => { created += data.length; assert.equal(data[0].emailSnapshot, "same@example.test"); } },
    surveyInstance: { update: async () => { state = "SENT"; } },
  };
  let tail: Promise<unknown> = Promise.resolve();
  const prisma = {
    $transaction: (run: (transaction: typeof tx) => Promise<unknown>) => { const result = tail.then(() => run(tx)); tail = result; return result; },
    scheduledSend: { findMany: async () => schedules },
    surveyInstance: { updateMany: async () => ({ count: 0 }) },
    surveyInvitation: { count: async () => created },
  };
  const api = loadTestModule<typeof Scheduled>("src/lib/scheduled-sends.ts", {
    "@/lib/prisma": { prisma },
    "@/lib/survey-token": { createSurveyToken: () => "token", encryptSurveyToken: () => "ciphertext", hashSurveyToken: () => "hash" },
    "@/lib/invitation-delivery": { emptyDeliveryCounters: () => ({}), processPendingInvitationDeliveries: async () => ({}), processDueSurveyReminders: async () => ({}) },
  });
  const results = await Promise.all([api.processDueScheduledSends(["one"]), api.processDueScheduledSends(["two"])]);
  assert.equal(created, 1);
  assert.equal(results.reduce((sum, r) => sum + r.processedCount, 0), 1);
  assert.ok(locks >= 2);
});

test("exhausted execution window leaves pending invitations untouched for a later run", async () => {
  const h = queueHarness();
  const result = await h.api.processPendingInvitationDeliveries({ deadline: Date.now() - 1 });
  assert.equal(result.attemptedCount, 0);
  assert.equal(h.sent(), 0);
});
