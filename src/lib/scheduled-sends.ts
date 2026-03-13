import { prisma } from "@/lib/prisma";

export async function processDueScheduledSends() {
  const now = new Date();

  const dueSends = await prisma.scheduledSend.findMany({
    where: {
      status: "PENDING",
      sendAt: { lte: now },
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

  for (const scheduledSend of dueSends) {
    const surveyInstance = scheduledSend.surveyInstance;

    const members = await prisma.member.findMany({
      where: {
        clubId: surveyInstance.clubId,
        active: true,
      },
      select: {
        id: true,
        email: true,
      },
    });

    const existingInvitationMemberIds = new Set(surveyInstance.invitations.map((invitation) => invitation.memberId));

    for (const member of members) {
      if (existingInvitationMemberIds.has(member.id)) {
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

      await prisma.mailLog.create({
        data: {
          surveyInvitationId: invitation.id,
          toEmail: member.email,
          subject: `Event-survey: ${surveyInstance.name}`,
          bodyPreview: `Besvar anonymt via link: /survey/${token}`,
          sentAt: now,
          status: "SENT",
        },
      });

      invitationsCreated += 1;
      mailLogsCreated += 1;
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
  };
}
