import { prisma } from "@/lib/prisma";
import { sendSurveyInvitation } from "@/lib/email";
import { decryptSurveyToken } from "@/lib/survey-token";

const MAX_DELIVERY_ATTEMPTS = 5;
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
      surveyInstance: { select: { name: true } },
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
      await prisma.$transaction([
        prisma.surveyInvitation.update({
          where: { id: candidate.id },
          data: {
            status: "SENT",
            deliveryStatus: "SENT",
            sentAt: now,
            nextDeliveryAttemptAt: null,
            lastDeliveryError: null,
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
