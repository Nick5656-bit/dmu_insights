import { processPendingInvitationDeliveries } from "@/lib/invitation-delivery";
import { prisma } from "@/lib/prisma";
import { createSurveyToken, encryptSurveyToken, hashSurveyToken } from "@/lib/survey-token";

const STALE_SCHEDULED_SEND_MINUTES = 15;

function subtractMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() - minutes * 60 * 1000);
}

export async function processDueScheduledSends(selectedScheduledSendIds?: string[]) {
  const now = new Date();
  const staleBefore = subtractMinutes(now, STALE_SCHEDULED_SEND_MINUTES);
  const selectedIds = selectedScheduledSendIds?.filter(Boolean) ?? [];

  const closedCount = await prisma.surveyInstance.updateMany({
    where: {
      status: "SENT",
      closesAt: { lte: now },
    },
    data: { status: "CLOSED" },
  });

  const dueSends = await prisma.scheduledSend.findMany({
    where: {
      status: "PENDING",
      sendAt: { lte: now },
      OR: [{ processingStartedAt: null }, { processingStartedAt: { lte: staleBefore } }],
      ...(selectedIds.length > 0 ? { id: { in: selectedIds } } : {}),
      surveyInstance: {
        status: "SCHEDULED",
        OR: [{ closesAt: null }, { closesAt: { gt: now } }],
      },
    },
    include: {
      surveyInstance: {
        include: {
          invitations: true,
        },
      },
    },
    orderBy: { sendAt: "asc" },
  });

  let processedCount = 0;
  let invitationsCreated = 0;
  let skippedNoParticipantsCount = 0;
  let scheduleFailuresCount = 0;

  for (const scheduledSend of dueSends) {
    const claim = await prisma.scheduledSend.updateMany({
      where: {
        id: scheduledSend.id,
        status: "PENDING",
        OR: [{ processingStartedAt: null }, { processingStartedAt: { lte: staleBefore } }],
      },
      data: { processingStartedAt: now },
    });

    if (claim.count === 0) {
      continue;
    }

    const surveyInstance = scheduledSend.surveyInstance;

    try {
      const existingInvitationEmails = new Set(
        surveyInstance.invitations.map((invitation) => invitation.emailSnapshot.trim().toLowerCase())
      );

      if (surveyInstance.surveyType === "EVENT") {
        if (!surveyInstance.eventId) {
          skippedNoParticipantsCount += 1;
          await prisma.scheduledSend.update({
            where: { id: scheduledSend.id },
            data: { processingStartedAt: null },
          });
          continue;
        }

        const participants = await prisma.eventParticipant.findMany({
          where: { eventId: surveyInstance.eventId },
          select: { id: true, email: true },
        });

        // A due event survey stays pending until its event-specific participant list is ready.
        if (participants.length === 0) {
          skippedNoParticipantsCount += 1;
          await prisma.scheduledSend.update({
            where: { id: scheduledSend.id },
            data: { processingStartedAt: null },
          });
          continue;
        }

        const existingInvitationParticipantIds = new Set(
          surveyInstance.invitations
            .map((invitation) => invitation.eventParticipantId)
            .filter((id): id is string => Boolean(id))
        );

        for (const participant of participants) {
          if (existingInvitationParticipantIds.has(participant.id)) {
            continue;
          }

          const normalizedEmail = participant.email.trim().toLowerCase();
          if (existingInvitationEmails.has(normalizedEmail)) {
            continue;
          }

          const token = createSurveyToken();
          await prisma.surveyInvitation.create({
            data: {
              surveyInstanceId: surveyInstance.id,
              eventParticipantId: participant.id,
              emailSnapshot: normalizedEmail,
              token: hashSurveyToken(token),
              tokenCiphertext: encryptSurveyToken(token),
            },
          });

          invitationsCreated += 1;
          existingInvitationParticipantIds.add(participant.id);
          existingInvitationEmails.add(normalizedEmail);
        }
      } else {
        const [members, extraEmails] = await Promise.all([
          prisma.member.findMany({
            where: { clubId: surveyInstance.clubId, active: true },
            select: { id: true, email: true },
          }),
          prisma.clubExtraEmail.findMany({
            where: { clubId: surveyInstance.clubId, active: true },
            select: { email: true },
          }),
        ]);

        const existingInvitationMemberIds = new Set(
          surveyInstance.invitations.map((invitation) => invitation.memberId).filter((id): id is string => Boolean(id))
        );

        for (const member of members) {
          if (existingInvitationMemberIds.has(member.id)) {
            continue;
          }

          const normalizedEmail = member.email.trim().toLowerCase();
          if (existingInvitationEmails.has(normalizedEmail)) {
            continue;
          }

          const token = createSurveyToken();
          await prisma.surveyInvitation.create({
            data: {
              surveyInstanceId: surveyInstance.id,
              memberId: member.id,
              emailSnapshot: normalizedEmail,
              token: hashSurveyToken(token),
              tokenCiphertext: encryptSurveyToken(token),
            },
          });

          invitationsCreated += 1;
          existingInvitationMemberIds.add(member.id);
          existingInvitationEmails.add(normalizedEmail);
        }

        for (const extraEmail of extraEmails) {
          const normalizedEmail = extraEmail.email.trim().toLowerCase();
          if (existingInvitationEmails.has(normalizedEmail)) {
            continue;
          }

          const token = createSurveyToken();
          await prisma.surveyInvitation.create({
            data: {
              surveyInstanceId: surveyInstance.id,
              emailSnapshot: normalizedEmail,
              token: hashSurveyToken(token),
              tokenCiphertext: encryptSurveyToken(token),
            },
          });

          invitationsCreated += 1;
          existingInvitationEmails.add(normalizedEmail);
        }
      }

      await prisma.$transaction([
        prisma.surveyInstance.update({
          where: { id: surveyInstance.id },
          data: {
            status: "SENT",
            sentAt: surveyInstance.sentAt ?? now,
          },
        }),
        prisma.scheduledSend.update({
          where: { id: scheduledSend.id },
          data: {
            status: "PROCESSED",
            processedAt: now,
            processingStartedAt: null,
          },
        }),
      ]);

      processedCount += 1;
    } catch (error) {
      console.error(`[scheduled-sends] Kunne ikke klargøre udsendelse ${scheduledSend.id}`, error);
      await prisma.scheduledSend.update({
        where: { id: scheduledSend.id },
        data: { processingStartedAt: null },
      });
      scheduleFailuresCount += 1;
    }
  }

  const delivery = await processPendingInvitationDeliveries();

  return {
    closedCount: closedCount.count,
    processedCount,
    invitationsCreated,
    skippedNoParticipantsCount,
    scheduleFailuresCount,
    delivery,
  };
}
