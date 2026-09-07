import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendSurveyInvitation } from "@/lib/email";
import { claimMailDelivery, pauseMailAccount } from "@/lib/mail-budget";
import { MAIL_WINDOW_MS } from "@/lib/mail-policy";
import { canScheduleReminder, getReminderScheduledAt, REMINDER_CLOSE_BUFFER_HOURS } from "@/lib/reminder-policy";
import { decryptSurveyToken } from "@/lib/survey-token";

type Counters = {
  candidatesCount: number; attemptedCount: number; deliveredCount: number;
  retryScheduledCount: number; permanentlyFailedCount: number;
  skippedClaimedCount: number; skippedCount: number; legacyFailuresMarkedCount: number;
  quotaDeferredCount: number; reviewCount: number; expiredCount: number;
};
export type DeliveryScope = { surveyInstanceIds?: string[]; deadline?: number };

export function emptyDeliveryCounters(): Counters {
  return { candidatesCount: 0, attemptedCount: 0, deliveredCount: 0, retryScheduledCount: 0,
    permanentlyFailedCount: 0, skippedClaimedCount: 0, skippedCount: 0, legacyFailuresMarkedCount: 0,
    quotaDeferredCount: 0, reviewCount: 0, expiredCount: 0 };
}

async function processQueue(kind: "INITIAL" | "REMINDER", scope: DeliveryScope) {
  const reminder = kind === "REMINDER";
  const now = new Date();
  const deadline = scope.deadline ?? Date.now() + 240_000;
  // undefined means cron/all; an explicitly empty selection NEVER means all.
  const whereScope = scope.surveyInstanceIds === undefined ? {} : { surveyInstanceId: { in: scope.surveyInstanceIds } };
  const counters = emptyDeliveryCounters();
  const staleBefore = new Date(now.getTime() - 15 * 60_000);
  const pending: Prisma.SurveyInvitationWhereInput = reminder ? { reminderStatus: "PENDING" } : { deliveryStatus: "PENDING" };
  const eligibleSurvey: Prisma.SurveyInstanceWhereInput = {
    status: "SENT",
    OR: [{ closesAt: null }, { closesAt: { gt: new Date(now.getTime() + (reminder ? REMINDER_CLOSE_BUFFER_HOURS * 3600_000 : 0)) } }],
  };

  // A worker can die after Brevo accepted a message but before the database commit.
  // Quarantine stale claims instead of automatically sending duplicate invitations.
  const stale = await prisma.surveyInvitation.updateMany({
    where: { ...whereScope, ...(reminder
      ? { reminderStatus: "SENDING", reminderLastAttemptAt: { lte: staleBefore } }
      : { deliveryStatus: "SENDING", lastDeliveryAttemptAt: { lte: staleBefore } }) },
    data: reminder
      ? { reminderStatus: "FAILED", reminderLastError: "Ukendt leveringsstatus efter afbrudt kørsel. Kontrollér Brevo; genudsendes ikke automatisk." }
      : { deliveryStatus: "FAILED", lastDeliveryError: "Ukendt leveringsstatus efter afbrudt kørsel. Kontrollér Brevo; genudsendes ikke automatisk." },
  });
  counters.reviewCount = stale.count;

  if (!reminder) {
    const legacy = await prisma.surveyInvitation.updateMany({
      where: { ...whereScope, deliveryStatus: "PENDING", tokenCiphertext: null, status: { in: ["SENT", "OPENED", "ANSWERED"] }, mailLogs: { none: { status: "FAILED" } } },
      data: { deliveryStatus: "SENT" },
    });
    counters.legacyFailuresMarkedCount = legacy.count;
  }

  const expired = await prisma.surveyInvitation.updateMany({
    where: { ...whereScope, ...pending, ...(reminder ? { OR: [{ status: "ANSWERED" }, { surveyInstance: { isNot: eligibleSurvey } }] }
      : { surveyInstance: { OR: [{ status: "CLOSED" }, { closesAt: { lte: now } }] } }) },
    data: reminder
      ? { reminderStatus: "SKIPPED", reminderNextAttemptAt: null, reminderLastError: null }
      : { deliveryStatus: "FAILED", nextDeliveryAttemptAt: null, lastDeliveryError: "Ikke afsendt: spørgeskemaet lukkede, før invitationen nåede gennem køen." },
  });
  counters.expiredCount = reminder ? 0 : expired.count;
  counters.skippedCount = reminder ? expired.count : 0;

  const candidates = await prisma.surveyInvitation.findMany({
    where: {
      ...whereScope, ...pending, surveyInstance: eligibleSurvey,
      ...(reminder
        ? { status: { in: ["SENT", "OPENED"] }, deliveryStatus: "SENT", OR: [{ reminderNextAttemptAt: null }, { reminderNextAttemptAt: { lte: now } }] }
        : { status: { in: ["CREATED", "SENT"] }, OR: [{ nextDeliveryAttemptAt: null }, { nextDeliveryAttemptAt: { lte: now } }] }),
    },
    select: { id: true, emailSnapshot: true, tokenCiphertext: true, deliveryAttempts: true, reminderAttempts: true,
      surveyInstance: { select: { name: true, closesAt: true, surveyType: true } } },
    orderBy: reminder ? [{ reminderNextAttemptAt: "asc" }, { createdAt: "asc" }] : [{ createdAt: "asc" }],
    take: 300,
  });
  counters.candidatesCount = candidates.length;
  let next = 0;
  let stopForQuota = false;
  async function worker() {
    while (next < candidates.length && Date.now() < deadline && !stopForQuota) {
      const candidate = candidates[next++];
      const attemptAt = new Date();
      const claim = await claimMailDelivery({
        ...whereScope, id: candidate.id, ...pending,
        surveyInstance: { status: "SENT", OR: [{ closesAt: null }, { closesAt: { gt: new Date(attemptAt.getTime() + (reminder ? REMINDER_CLOSE_BUFFER_HOURS * 3600_000 : 0)) } }] },
        ...(reminder ? { status: { in: ["SENT", "OPENED"] }, deliveryStatus: "SENT",
          OR: [{ reminderNextAttemptAt: null }, { reminderNextAttemptAt: { lte: attemptAt } }] }
          : { status: { in: ["CREATED", "SENT"] }, OR: [{ nextDeliveryAttemptAt: null }, { nextDeliveryAttemptAt: { lte: attemptAt } }] }),
      }, reminder
        ? { reminderStatus: "SENDING", reminderAttempts: { increment: 1 }, reminderLastAttemptAt: attemptAt, reminderNextAttemptAt: null, reminderLastError: null }
        : { deliveryStatus: "SENDING", deliveryAttempts: { increment: 1 }, lastDeliveryAttemptAt: attemptAt, nextDeliveryAttemptAt: null, lastDeliveryError: null });
      if (!claim.claimed) {
        if (claim.quota) {
          stopForQuota = true;
          counters.quotaDeferredCount++;
          await prisma.surveyInvitation.updateMany({
            where: { id: candidate.id, ...pending },
            data: reminder ? { reminderNextAttemptAt: claim.retryAt, reminderLastError: "Afventer ledig mailkvote." }
              : { nextDeliveryAttemptAt: claim.retryAt, lastDeliveryError: "Afventer ledig mailkvote." },
          });
        } else counters.skippedClaimedCount++;
        continue;
      }
      counters.attemptedCount++;
      let token: string;
      try {
        if (!candidate.tokenCiphertext) throw new Error("Missing token");
        token = decryptSurveyToken(candidate.tokenCiphertext);
      } catch {
        await prisma.surveyInvitation.update({
          where: { id: candidate.id },
          data: reminder ? { reminderStatus: "FAILED", reminderLastError: "Krypteret link kan ikke læses." }
            : { deliveryStatus: "FAILED", lastDeliveryError: "Krypteret link kan ikke læses." },
        });
        counters.permanentlyFailedCount++;
        continue;
      }

      const result = await sendSurveyInvitation({ kind, toEmail: candidate.emailSnapshot, surveyName: candidate.surveyInstance.name, surveyType: candidate.surveyInstance.surveyType, token });
      const completedAt = new Date();
      let data: Prisma.SurveyInvitationUpdateInput;
      if (result.success) {
        data = reminder
          ? { reminderStatus: "SENT", reminderSentAt: completedAt, reminderNextAttemptAt: null, reminderLastError: null }
          : { deliveryStatus: "SENT", sentAt: completedAt, nextDeliveryAttemptAt: null, lastDeliveryError: null,
              ...(canScheduleReminder(candidate.surveyInstance.closesAt, completedAt)
                ? { reminderStatus: "PENDING", reminderScheduledAt: getReminderScheduledAt(completedAt), reminderNextAttemptAt: getReminderScheduledAt(completedAt) } : {}) };
        counters.deliveredCount++;
      } else {
        const accountPaused = result.quotaBlocked || result.accountBlocked;
        const attempts = (reminder ? candidate.reminderAttempts : candidate.deliveryAttempts) + 1;
        const retry = !result.uncertain && (accountPaused || (result.retryable && attempts < (reminder ? 3 : 5)));
        const retryAt = new Date(completedAt.getTime() + (accountPaused ? MAIL_WINDOW_MS : Math.min(2 ** (attempts - 1), 7) * MAIL_WINDOW_MS));
        const error = result.error.replace(/[\r\n]/g, " ").slice(0, 240);
        if (accountPaused) {
          await pauseMailAccount(retryAt);
          stopForQuota = true;
          counters.quotaDeferredCount++;
        }
        data = reminder
          ? { reminderStatus: retry ? "PENDING" : "FAILED", reminderNextAttemptAt: retry ? retryAt : null, reminderLastError: error,
              ...(accountPaused ? { reminderAttempts: { decrement: 1 } } : {}) }
          : { deliveryStatus: retry ? "PENDING" : "FAILED", nextDeliveryAttemptAt: retry ? retryAt : null, lastDeliveryError: error,
              ...(accountPaused ? { deliveryAttempts: { decrement: 1 } } : {}) };
        if (retry) counters.retryScheduledCount++;
        else if (result.uncertain) counters.reviewCount++;
        else counters.permanentlyFailedCount++;
      }
      await prisma.$transaction(async (tx) => {
        await tx.surveyInvitation.update({ where: { id: candidate.id }, data });
        // Never overwrite OPENED/ANSWERED when the recipient responded unusually fast.
        if (result.success && !reminder) await tx.surveyInvitation.updateMany({ where: { id: candidate.id, status: "CREATED" }, data: { status: "SENT" } });
        await tx.mailLog.create({ data: {
          surveyInvitationId: candidate.id, toEmail: candidate.emailSnapshot,
          subject: `${reminder ? "Påmindelse: " : ""}Din mening om ${candidate.surveyInstance.name}`,
          bodyPreview: result.success ? "Accepteret af mailudbyderen. Det personlige link gemmes ikke i historikken." : "Afsendelsen blev ikke bekræftet. Se invitationens status.",
          sentAt: attemptAt, status: result.success ? "SENT" : "FAILED", quotaTracked: true,
        } });
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, candidates.length) }, () => worker()));
  return counters;
}

export function processPendingInvitationDeliveries(scope: DeliveryScope = {}) {
  return processQueue("INITIAL", scope);
}

export function processDueSurveyReminders(scope: DeliveryScope = {}) {
  return processQueue("REMINDER", scope);
}
