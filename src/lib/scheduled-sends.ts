import { prisma } from "@/lib/prisma";
import { sendSurveyInvitation } from "@/lib/email";

export async function processDueScheduledSends(selectedScheduledSendIds?: string[]) {
  const now = new Date();
  const selectedIds = selectedScheduledSendIds?.filter(Boolean) ?? [];

  const dueSends = await prisma.scheduledSend.findMany({
    where: {
      status: "PENDING",
      sendAt: { lte: now },
      ...(selectedIds.length > 0 ? { id: { in: selectedIds } } : {}),
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
  let skippedNotReadyCount = 0;

  for (const scheduledSend of dueSends) {
    const surveyInstance = scheduledSend.surveyInstance;

    // Event surveys require explicit club readiness before DMU can process send.
    if (surveyInstance.surveyType === "EVENT" && !surveyInstance.clubReadyAt) {
      skippedNotReadyCount += 1;
      continue;
    }

    const [members, extraEmails] = await Promise.all([
      prisma.member.findMany({
        where: {
          clubId: surveyInstance.clubId,
          active: true,
        },
        select: {
          id: true,
          email: true,
        },
      }),
      prisma.clubExtraEmail.findMany({
        where: {
          clubId: surveyInstance.clubId,
          active: true,
        },
        select: {
          email: true,
        },
      }),
    ]);

    const existingInvitationMemberIds = new Set(
      surveyInstance.invitations.map((invitation) => invitation.memberId).filter((id): id is string => Boolean(id))
    );
    const existingInvitationEmails = new Set(
      surveyInstance.invitations.map((invitation) => invitation.emailSnapshot.trim().toLowerCase())
    );

    for (const member of members) {
      if (existingInvitationMemberIds.has(member.id)) {
        continue;
      }

      const normalizedEmail = member.email.trim().toLowerCase();
      if (existingInvitationEmails.has(normalizedEmail)) {
        continue;
      }

      const token = `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, "")}`;

      const invitation = await prisma.surveyInvitation.create({
        data: {
          surveyInstanceId: surveyInstance.id,
          memberId: member.id,
          emailSnapshot: member.email,
          token,
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
          bodyPreview: `Besvar anonymt via link: ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/survey/${token}`,
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

      const token = `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, "")}`;

      const invitation = await prisma.surveyInvitation.create({
        data: {
          surveyInstanceId: surveyInstance.id,
          memberId: null,
          emailSnapshot: normalizedEmail,
          token,
          status: "SENT",
          sentAt: now,
        },
      });

      const extraEmailResult = await sendSurveyInvitation({
        toEmail: normalizedEmail,
        surveyName: surveyInstance.name,
        token,
      });

      await prisma.mailLog.create({
        data: {
          surveyInvitationId: invitation.id,
          toEmail: normalizedEmail,
          subject: `Din mening om ${surveyInstance.name}`,
          bodyPreview: `Besvar anonymt via link: ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/survey/${token}`,
          sentAt: now,
          status: extraEmailResult.success ? "SENT" : "FAILED",
        },
      });

      invitationsCreated += 1;
      mailLogsCreated += 1;
      existingInvitationEmails.add(normalizedEmail);
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
    processedCount,
    invitationsCreated,
    mailLogsCreated,
    skippedNotReadyCount,
  };
}
