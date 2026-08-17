import { prisma } from "@/lib/prisma";
import { sendSurveyInvitation } from "@/lib/email";
import { createSurveyToken, hashSurveyToken } from "@/lib/survey-token";

export async function processDueScheduledSends(selectedScheduledSendIds?: string[]) {
  const now = new Date();
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
  let mailLogsCreated = 0;
  const skippedNotReadyCount = 0;
  let skippedNoParticipantsCount = 0;

  for (const scheduledSend of dueSends) {
    const surveyInstance = scheduledSend.surveyInstance;

    const existingInvitationEmails = new Set(
      surveyInstance.invitations.map((invitation) => invitation.emailSnapshot.trim().toLowerCase())
    );

    if (surveyInstance.surveyType === "EVENT") {
      if (!surveyInstance.eventId) {
        skippedNoParticipantsCount += 1;
        continue;
      }

      const participants = await prisma.eventParticipant.findMany({
        where: { eventId: surveyInstance.eventId },
        select: { id: true, email: true },
      });

      // A due event survey stays pending until its event-specific participant list is ready.
      if (participants.length === 0) {
        skippedNoParticipantsCount += 1;
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
        const invitation = await prisma.surveyInvitation.create({
          data: {
            surveyInstanceId: surveyInstance.id,
            eventParticipantId: participant.id,
            emailSnapshot: normalizedEmail,
            token: hashSurveyToken(token),
            status: "SENT",
            sentAt: now,
          },
        });

        const emailResult = await sendSurveyInvitation({
          toEmail: normalizedEmail,
          surveyName: surveyInstance.name,
          token,
        });

        await prisma.mailLog.create({
          data: {
            surveyInvitationId: invitation.id,
            toEmail: normalizedEmail,
            subject: `Din mening om ${surveyInstance.name}`,
            bodyPreview: "Personligt besvarelseslink sendt. Linket gemmes ikke i mailhistorikken.",
            sentAt: now,
            status: emailResult.success ? "SENT" : "FAILED",
          },
        });

        invitationsCreated += 1;
        mailLogsCreated += 1;
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
        const invitation = await prisma.surveyInvitation.create({
          data: {
            surveyInstanceId: surveyInstance.id,
            memberId: member.id,
            emailSnapshot: member.email,
            token: hashSurveyToken(token),
            status: "SENT",
            sentAt: now,
          },
        });

        const emailResult = await sendSurveyInvitation({
          toEmail: member.email,
          surveyName: surveyInstance.name,
          token,
        });

        await prisma.mailLog.create({
          data: {
            surveyInvitationId: invitation.id,
            toEmail: member.email,
            subject: `Din mening om ${surveyInstance.name}`,
            bodyPreview: "Personligt besvarelseslink sendt. Linket gemmes ikke i mailhistorikken.",
            sentAt: now,
            status: emailResult.success ? "SENT" : "FAILED",
          },
        });

        invitationsCreated += 1;
        mailLogsCreated += 1;
        existingInvitationMemberIds.add(member.id);
        existingInvitationEmails.add(normalizedEmail);
      }

      for (const extraEmail of extraEmails) {
        const normalizedEmail = extraEmail.email.trim().toLowerCase();
        if (existingInvitationEmails.has(normalizedEmail)) {
          continue;
        }

        const token = createSurveyToken();
        const invitation = await prisma.surveyInvitation.create({
          data: {
            surveyInstanceId: surveyInstance.id,
            emailSnapshot: normalizedEmail,
            token: hashSurveyToken(token),
            status: "SENT",
            sentAt: now,
          },
        });

        const emailResult = await sendSurveyInvitation({
          toEmail: normalizedEmail,
          surveyName: surveyInstance.name,
          token,
        });

        await prisma.mailLog.create({
          data: {
            surveyInvitationId: invitation.id,
            toEmail: normalizedEmail,
            subject: `Din mening om ${surveyInstance.name}`,
            bodyPreview: "Personligt besvarelseslink sendt. Linket gemmes ikke i mailhistorikken.",
            sentAt: now,
            status: emailResult.success ? "SENT" : "FAILED",
          },
        });

        invitationsCreated += 1;
        mailLogsCreated += 1;
        existingInvitationEmails.add(normalizedEmail);
      }
    }

    await prisma.surveyInstance.update({
      where: { id: surveyInstance.id },
      data: {
        status: "SENT",
        sentAt: surveyInstance.sentAt ?? now,
      },
    });

    await prisma.scheduledSend.update({
      where: { id: scheduledSend.id },
      data: {
        status: "PROCESSED",
        processedAt: now,
      },
    });

    processedCount += 1;
  }

  return {
    closedCount: closedCount.count,
    processedCount,
    invitationsCreated,
    mailLogsCreated,
    skippedNotReadyCount,
    skippedNoParticipantsCount,
  };
}
