import { emptyDeliveryCounters, processDueSurveyReminders, processPendingInvitationDeliveries } from "@/lib/invitation-delivery";
import { prisma } from "@/lib/prisma";
import { createSurveyToken, encryptSurveyToken, hashSurveyToken } from "@/lib/survey-token";

// Preparing a schedule is one transaction: partial lists and overlapping clicks cannot duplicate it.
async function prepareScheduledSend(id: string) {
  return prisma.$transaction(async (tx) => {
    // Also lock the survey: legacy data can contain several schedules for one survey.
    await tx.$queryRaw`SELECT s.id FROM "SurveyInstance" s
      JOIN "ScheduledSend" d ON d."surveyInstanceId" = s.id
      WHERE d.id = ${id} FOR UPDATE OF s, d`;
    const now = new Date();
    const schedule = await tx.scheduledSend.findFirst({
      where: { id, status: "PENDING", sendAt: { lte: now },
        surveyInstance: { status: "SCHEDULED", OR: [{ closesAt: null }, { closesAt: { gt: now } }] } },
      include: { surveyInstance: { include: { invitations: { select: { emailSnapshot: true } } } } },
    });
    if (!schedule) return { processed: false, empty: false, created: 0 };
    const survey = schedule.surveyInstance;
    const recipients: { email: string; memberId?: string; eventParticipantId?: string }[] = [];
    if (survey.surveyType === "EVENT") {
      if (survey.eventId) {
        const participants = await tx.eventParticipant.findMany({ where: { eventId: survey.eventId }, select: { id: true, email: true } });
        recipients.push(...participants.map((p) => ({ email: p.email, eventParticipantId: p.id })));
      }
    } else {
      const [members, extra] = await Promise.all([
        tx.member.findMany({ where: { clubId: survey.clubId, active: true }, select: { id: true, email: true } }),
        tx.clubExtraEmail.findMany({ where: { clubId: survey.clubId, active: true }, select: { email: true } }),
      ]);
      recipients.push(...members.map((m) => ({ email: m.email, memberId: m.id })), ...extra);
    }
    if (!recipients.length) return { processed: false, empty: true, created: 0 };
    const existing = new Set(survey.invitations.map((invitation) => invitation.emailSnapshot.toLowerCase().trim()));
    const invitations = [];
    for (const recipient of recipients) {
      const email = recipient.email.trim().toLowerCase();
      if (existing.has(email)) continue;
      existing.add(email);
      const token = createSurveyToken();
      invitations.push({ surveyInstanceId: survey.id, emailSnapshot: email, memberId: recipient.memberId,
        eventParticipantId: recipient.eventParticipantId, token: hashSurveyToken(token), tokenCiphertext: encryptSurveyToken(token) });
    }
    if (invitations.length) await tx.surveyInvitation.createMany({ data: invitations });
    await tx.surveyInstance.update({ where: { id: survey.id }, data: { status: "SENT", sentAt: survey.sentAt ?? now } });
    await tx.scheduledSend.update({ where: { id }, data: { status: "PROCESSED", processedAt: now, processingStartedAt: null } });
    return { processed: true, empty: false, created: invitations.length };
  }, { timeout: 20_000 });
}

export async function processDueScheduledSends(selectedScheduledSendIds?: string[]) {
  const now = new Date();
  const deadline = Date.now() + 240_000;
  // Explicit [] is deliberately fail-closed. Only cron omits the argument.
  const manual = selectedScheduledSendIds !== undefined;
  const ids = [...new Set(selectedScheduledSendIds?.filter(Boolean) ?? [])];
  const schedules = await prisma.scheduledSend.findMany({
    where: manual ? { id: { in: ids } } : { status: "PENDING", sendAt: { lte: now } },
    select: { id: true, surveyInstanceId: true, status: true, sendAt: true },
    orderBy: { sendAt: "asc" },
  });
  const surveyInstanceIds = manual ? [...new Set(schedules.map((s) => s.surveyInstanceId))] : undefined;
  const scope = { surveyInstanceIds, deadline };
  const closed = await prisma.surveyInstance.updateMany({
    where: { ...(manual ? { id: { in: surveyInstanceIds } } : {}), status: { in: ["SENT", "SCHEDULED"] }, closesAt: { lte: now } },
    data: { status: "CLOSED" },
  });
  let processedCount = 0, invitationsCreated = 0, skippedNoParticipantsCount = 0, scheduleFailuresCount = 0;
  for (const schedule of schedules) {
    if (Date.now() >= deadline - 25_000) break;
    if (schedule.status !== "PENDING" || schedule.sendAt > now) continue;
    try {
      const result = await prepareScheduledSend(schedule.id);
      if (result.processed) processedCount++;
      if (result.empty) skippedNoParticipantsCount++;
      invitationsCreated += result.created;
    } catch {
      // No recipient data, access tokens or database connection details in application logs.
      console.error("[scheduled-sends] Klargøring fejlede; hele transaktionen er rullet tilbage.");
      scheduleFailuresCount++;
    }
  }
  const delivery = await processPendingInvitationDeliveries(scope);
  // A manual click sends selected initial invitations/retries only, never unrelated reminders.
  const reminders = manual ? emptyDeliveryCounters() : await processDueSurveyReminders(scope);
  const remainingCount = await prisma.surveyInvitation.count({
    where: { ...(manual ? { surveyInstanceId: { in: surveyInstanceIds } } : {}), deliveryStatus: { in: ["PENDING", "SENDING"] }, surveyInstance: { status: "SENT" } },
  });
  return { closedCount: closed.count, processedCount, invitationsCreated, skippedNoParticipantsCount,
    scheduleFailuresCount, delivery, reminders, remainingCount };
}
