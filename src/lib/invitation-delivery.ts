import { prisma } from "@/lib/prisma";
import { sendSurveyInvitation, sendSurveyReminder } from "@/lib/email";
import {
  canScheduleReminder,
  getReminderScheduledAt,
  REMINDER_CLOSE_BUFFER_HOURS,
  shouldSkipSurveyReminder,
} from "@/lib/reminder-policy";
import { decryptSurveyToken } from "@/lib/survey-token";

const MAX_DELIVERY_ATTEMPTS = 5;
const MAX_REMINDER_ATTEMPTS = 3;
const DELIVERY_BATCH_SIZE = 200;
const DELIVERY_CONCURRENCY = 5;
const STALE_DELIVERY_MINUTES = 15;
// The platform's current Vercel job runs once daily, so retry windows are
// intentionally day-based. A more frequent scheduler can use shorter windows later.
const retryDelaysInMinutes = [24 * 60, 2 * 24 * 60, 4 * 24 * 60, 7 * 24 * 60];

type DeliveryCounters = {
  candidatesCount: number;
  attemptedCount: number;
  deliveredCount: number;
  retryScheduledCount: number;
  permanentlyFailedCount: number;
  skippedClaimedCount: number;
  legacyFailuresMarkedCount: number;
};

type ReminderCounters = {
  candidatesCount: number;
  attemptedCount: number;
  deliveredCount: number;
  retryScheduledCount: number;
  permanentlyFailedCount: number;
  skippedCount: number;
  skippedClaimedCount: number;
};

function subtractMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() - minutes * 60 * 1000);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function getRetryAt(now: Date, attemptNumber: number) {
  const delay = retryDelaysInMinutes[Math.min(attemptNumber - 1, retryDelaysInMinutes.length - 1)];
  return addMinutes(now, delay);
}

function errorSummary(message: string) {
  return message.replace(/[\r\n]+/g, " ").trim().slice(0, 240) || "Ukendt leveringsfejl";
}

async function processWithConcurrency<T>(items: T[], task: (item: T) => Promise<void>) {
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await task(item);
    }
  }

  await Promise.all(Array.from({ length: Math.min(DELIVERY_CONCURRENCY, items.length) }, worker));
}

async function markLegacyDeliveryStates() {
  const [failedWithMailLog, unrecoverableCreated] = await Promise.all([
    prisma.surveyInvitation.updateMany({
      where: {
        tokenCiphertext: null,
        deliveryStatus: "PENDING",
        mailLogs: { some: { status: "FAILED" } },
      },
      data: {
        deliveryStatus: "FAILED",
        lastDeliveryError: "Kan ikke genudsende en historisk invitation uden et krypteret link.",
      },
    }),
    prisma.surveyInvitation.updateMany({
      where: {
        tokenCiphertext: null,
        deliveryStatus: "PENDING",
        status: "CREATED",
      },
      data: {
        deliveryStatus: "FAILED",
        lastDeliveryError: "Kan ikke genudsende en historisk invitation uden et krypteret link.",
      },
    }),
  ]);

  await prisma.surveyInvitation.updateMany({
    where: {
      tokenCiphertext: null,
      deliveryStatus: "PENDING",
      status: { in: ["SENT", "OPENED", "ANSWERED"] },
    },
    data: { deliveryStatus: "SENT" },
  });

  return failedWithMailLog.count + unrecoverableCreated.count;
}

/**
 * Sends new invitations and retries transient Brevo failures. The individual invitation
 * is claimed atomically, so overlapping cron requests cannot send the same message twice.
 */
export async function processPendingInvitationDeliveries() {
  const now = new Date();
  const staleBefore = subtractMinutes(now, STALE_DELIVERY_MINUTES);
  const legacyFailuresMarkedCount = await markLegacyDeliveryStates();

  const candidates = await prisma.surveyInvitation.findMany({
    where: {
      status: { in: ["CREATED", "SENT"] },
      OR: [
        {
          deliveryStatus: "PENDING",
          OR: [{ nextDeliveryAttemptAt: null }, { nextDeliveryAttemptAt: { lte: now } }],
        },
        {
          deliveryStatus: "SENDING",
          lastDeliveryAttemptAt: { lte: staleBefore },
        },
      ],
      surveyInstance: {
        status: "SENT",
        OR: [{ closesAt: null }, { closesAt: { gt: now } }],
      },
    },
    select: {
      id: true,
      emailSnapshot: true,
      tokenCiphertext: true,
      deliveryAttempts: true,
      surveyInstance: { select: { name: true, closesAt: true } },
    },
    orderBy: [{ nextDeliveryAttemptAt: "asc" }, { createdAt: "asc" }],
    take: DELIVERY_BATCH_SIZE,
  });

  const counters: DeliveryCounters = {
    candidatesCount: candidates.length,
    attemptedCount: 0,
    deliveredCount: 0,
    retryScheduledCount: 0,
    permanentlyFailedCount: 0,
    skippedClaimedCount: 0,
    legacyFailuresMarkedCount,
  };

  await processWithConcurrency(candidates, async (candidate) => {
    const claim = await prisma.surveyInvitation.updateMany({
      where: {
        id: candidate.id,
        status: { in: ["CREATED", "SENT"] },
        OR: [
          {
            deliveryStatus: "PENDING",
            OR: [{ nextDeliveryAttemptAt: null }, { nextDeliveryAttemptAt: { lte: now } }],
          },
          {
            deliveryStatus: "SENDING",
            lastDeliveryAttemptAt: { lte: staleBefore },
          },
        ],
        surveyInstance: {
          status: "SENT",
          OR: [{ closesAt: null }, { closesAt: { gt: now } }],
        },
      },
      data: {
        deliveryStatus: "SENDING",
        deliveryAttempts: { increment: 1 },
        lastDeliveryAttemptAt: now,
        nextDeliveryAttemptAt: null,
        lastDeliveryError: null,
      },
    });

    if (claim.count === 0) {
      counters.skippedClaimedCount += 1;
      return;
    }

    counters.attemptedCount += 1;
    const attemptNumber = candidate.deliveryAttempts + 1;
    const baseMailLog = {
      surveyInvitationId: candidate.id,
      toEmail: candidate.emailSnapshot,
      subject: `Din mening om ${candidate.surveyInstance.name}`,
      bodyPreview: "Personligt besvarelseslink sendt. Linket gemmes ikke i mailhistorikken.",
      sentAt: now,
    };

    let token: string;
    try {
      if (!candidate.tokenCiphertext) {
        throw new Error("Krypteret link mangler");
      }
      token = decryptSurveyToken(candidate.tokenCiphertext);
    } catch {
      await prisma.$transaction([
        prisma.surveyInvitation.update({
          where: { id: candidate.id },
          data: {
            deliveryStatus: "FAILED",
            lastDeliveryError: "Krypteret link kunne ikke læses. Invitationen kan ikke genudsende automatisk.",
          },
        }),
        prisma.mailLog.create({ data: { ...baseMailLog, status: "FAILED" } }),
      ]);
      counters.permanentlyFailedCount += 1;
      return;
    }

    const emailResult = await sendSurveyInvitation({
      toEmail: candidate.emailSnapshot,
      surveyName: candidate.surveyInstance.name,
      token,
    });

    if (emailResult.success) {
      const reminderScheduledAt = getReminderScheduledAt(now);
      const scheduleReminder = canScheduleReminder(candidate.surveyInstance.closesAt, now);

      await prisma.$transaction([
        prisma.surveyInvitation.update({
          where: { id: candidate.id },
          data: {
            status: "SENT",
            deliveryStatus: "SENT",
            sentAt: now,
            nextDeliveryAttemptAt: null,
            lastDeliveryError: null,
            ...(scheduleReminder
              ? {
                  reminderStatus: "PENDING",
                  reminderScheduledAt,
                  reminderNextAttemptAt: reminderScheduledAt,
                  reminderLastError: null,
                }
              : {}),
          },
        }),
        prisma.mailLog.create({ data: { ...baseMailLog, status: "SENT" } }),
      ]);
      counters.deliveredCount += 1;
      return;
    }

    const shouldRetry = emailResult.retryable && attemptNumber < MAX_DELIVERY_ATTEMPTS;
    const failureMessage = errorSummary(emailResult.error);
    await prisma.$transaction([
      prisma.surveyInvitation.update({
        where: { id: candidate.id },
        data: shouldRetry
          ? {
              deliveryStatus: "PENDING",
              nextDeliveryAttemptAt: getRetryAt(now, attemptNumber),
              lastDeliveryError: failureMessage,
            }
          : {
              deliveryStatus: "FAILED",
              nextDeliveryAttemptAt: null,
              lastDeliveryError: failureMessage,
            },
      }),
      prisma.mailLog.create({ data: { ...baseMailLog, status: "FAILED" } }),
    ]);

    if (shouldRetry) {
      counters.retryScheduledCount += 1;
    } else {
      counters.permanentlyFailedCount += 1;
    }
  });

  return counters;
}

/**
 * Sends one optional follow-up after a delivered invitation. A reminder is never
 * sent to an answered survey or during the final 24 hours before survey closure.
 */
export async function processDueSurveyReminders() {
  const now = new Date();
  const staleBefore = subtractMinutes(now, STALE_DELIVERY_MINUTES);
  const closeBufferEnd = new Date(now.getTime() + REMINDER_CLOSE_BUFFER_HOURS * 60 * 60 * 1000);

  const candidates = await prisma.surveyInvitation.findMany({
    where: {
      deliveryStatus: "SENT",
      OR: [
        {
          reminderStatus: "PENDING",
          OR: [{ reminderNextAttemptAt: null }, { reminderNextAttemptAt: { lte: now } }],
        },
        {
          reminderStatus: "SENDING",
          reminderLastAttemptAt: { lte: staleBefore },
        },
      ],
    },
    select: {
      id: true,
      emailSnapshot: true,
      tokenCiphertext: true,
      reminderAttempts: true,
      status: true,
      surveyInstance: { select: { name: true, status: true, closesAt: true } },
    },
    orderBy: [{ reminderNextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: DELIVERY_BATCH_SIZE,
  });

  const counters: ReminderCounters = {
    candidatesCount: candidates.length,
    attemptedCount: 0,
    deliveredCount: 0,
    retryScheduledCount: 0,
    permanentlyFailedCount: 0,
    skippedCount: 0,
    skippedClaimedCount: 0,
  };

  await processWithConcurrency(candidates, async (candidate) => {
    const shouldSkip = shouldSkipSurveyReminder({
      invitationStatus: candidate.status,
      surveyStatus: candidate.surveyInstance.status,
      closesAt: candidate.surveyInstance.closesAt,
      now,
    });

    if (shouldSkip) {
      const skipped = await prisma.surveyInvitation.updateMany({
        where: {
          id: candidate.id,
          reminderStatus: { in: ["PENDING", "SENDING"] },
        },
        data: {
          reminderStatus: "SKIPPED",
          reminderNextAttemptAt: null,
          reminderLastError: null,
        },
      });
      counters.skippedCount += skipped.count;
      return;
    }

    const claim = await prisma.surveyInvitation.updateMany({
      where: {
        id: candidate.id,
        status: { in: ["SENT", "OPENED"] },
        deliveryStatus: "SENT",
        OR: [
          {
            reminderStatus: "PENDING",
            OR: [{ reminderNextAttemptAt: null }, { reminderNextAttemptAt: { lte: now } }],
          },
          {
            reminderStatus: "SENDING",
            reminderLastAttemptAt: { lte: staleBefore },
          },
        ],
        surveyInstance: {
          status: "SENT",
          OR: [{ closesAt: null }, { closesAt: { gt: closeBufferEnd } }],
        },
      },
      data: {
        reminderStatus: "SENDING",
        reminderAttempts: { increment: 1 },
        reminderLastAttemptAt: now,
        reminderNextAttemptAt: null,
        reminderLastError: null,
      },
    });

    if (claim.count === 0) {
      counters.skippedClaimedCount += 1;
      return;
    }

    counters.attemptedCount += 1;
    const attemptNumber = candidate.reminderAttempts + 1;
    const baseMailLog = {
      surveyInvitationId: candidate.id,
      toEmail: candidate.emailSnapshot,
      subject: `Påmindelse: Din mening om ${candidate.surveyInstance.name}`,
      bodyPreview: "En enkelt påmindelse med det personlige besvarelseslink er sendt.",
      sentAt: now,
    };

    let token: string;
    try {
      if (!candidate.tokenCiphertext) {
        throw new Error("Krypteret link mangler");
      }
      token = decryptSurveyToken(candidate.tokenCiphertext);
    } catch {
      await prisma.$transaction([
        prisma.surveyInvitation.update({
          where: { id: candidate.id },
          data: {
            reminderStatus: "FAILED",
            reminderNextAttemptAt: null,
            reminderLastError: "Det krypterede link til paamindelsen kunne ikke laeses.",
          },
        }),
        prisma.mailLog.create({ data: { ...baseMailLog, status: "FAILED" } }),
      ]);
      counters.permanentlyFailedCount += 1;
      return;
    }

    const emailResult = await sendSurveyReminder({
      toEmail: candidate.emailSnapshot,
      surveyName: candidate.surveyInstance.name,
      token,
    });

    if (emailResult.success) {
      await prisma.$transaction([
        prisma.surveyInvitation.update({
          where: { id: candidate.id },
          data: {
            reminderStatus: "SENT",
            reminderSentAt: now,
            reminderNextAttemptAt: null,
            reminderLastError: null,
          },
        }),
        prisma.mailLog.create({ data: { ...baseMailLog, status: "SENT" } }),
      ]);
      counters.deliveredCount += 1;
      return;
    }

    const shouldRetry = emailResult.retryable && attemptNumber < MAX_REMINDER_ATTEMPTS;
    const failureMessage = errorSummary(emailResult.error);
    await prisma.$transaction([
      prisma.surveyInvitation.update({
        where: { id: candidate.id },
        data: shouldRetry
          ? {
              reminderStatus: "PENDING",
              reminderNextAttemptAt: getRetryAt(now, attemptNumber),
              reminderLastError: failureMessage,
            }
          : {
              reminderStatus: "FAILED",
              reminderNextAttemptAt: null,
              reminderLastError: failureMessage,
            },
      }),
      prisma.mailLog.create({ data: { ...baseMailLog, status: "FAILED" } }),
    ]);

    if (shouldRetry) {
      counters.retryScheduledCount += 1;
    } else {
      counters.permanentlyFailedCount += 1;
    }
  });

  return counters;
}
