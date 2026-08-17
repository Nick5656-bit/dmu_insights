import { prisma } from "@/lib/prisma";

export const PII_RETENTION_DAYS = 90;
export const RESPONSE_RETENTION_YEARS = 3;

const REDACTED_EMAIL_SNAPSHOT = "[redacted after retention period]";

function subtractDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

function subtractYears(date: Date, years: number) {
  const result = new Date(date);
  result.setUTCFullYear(result.getUTCFullYear() - years);
  return result;
}

/**
 * Removes contact data after 90 days while retaining non-identifying delivery
 * totals. Fully anonymised survey responses are removed after three years.
 */
export async function processDataRetention() {
  const now = new Date();
  const piiCutoff = subtractDays(now, PII_RETENTION_DAYS);
  const responseCutoff = subtractYears(now, RESPONSE_RETENTION_YEARS);

  const [surveysDueForRedaction, surveysDueForResponseDeletion] = await Promise.all([
    prisma.surveyInstance.findMany({
      where: {
        status: "CLOSED",
        closesAt: { not: null, lte: piiCutoff },
        invitations: { some: { emailSnapshot: { not: REDACTED_EMAIL_SNAPSHOT } } },
      },
      select: { id: true, eventId: true },
    }),
    prisma.surveyInstance.findMany({
      where: {
        status: "CLOSED",
        closesAt: { not: null, lte: responseCutoff },
      },
      select: { id: true },
    }),
  ]);

  const surveyIds = surveysDueForRedaction.map((survey) => survey.id);
  const eventIds = surveysDueForRedaction.flatMap((survey) => (survey.eventId ? [survey.eventId] : []));
  const responseSurveyIds = surveysDueForResponseDeletion.map((survey) => survey.id);

  let mailLogsDeleted = 0;
  let invitationsRedacted = 0;
  let eventParticipantsDeleted = 0;

  if (surveyIds.length > 0) {
    const [mailLogs, invitations, participants] = await prisma.$transaction([
      prisma.mailLog.deleteMany({
        where: { surveyInvitation: { surveyInstanceId: { in: surveyIds } } },
      }),
      prisma.surveyInvitation.updateMany({
        where: {
          surveyInstanceId: { in: surveyIds },
          emailSnapshot: { not: REDACTED_EMAIL_SNAPSHOT },
        },
        data: {
          emailSnapshot: REDACTED_EMAIL_SNAPSHOT,
          memberId: null,
          eventParticipantId: null,
          tokenCiphertext: null,
          lastDeliveryError: null,
          reminderLastError: null,
        },
      }),
      prisma.eventParticipant.deleteMany({
        where: { eventId: { in: eventIds } },
      }),
    ]);

    mailLogsDeleted = mailLogs.count;
    invitationsRedacted = invitations.count;
    eventParticipantsDeleted = participants.count;
  }

  const responsesDeleted = responseSurveyIds.length
    ? await prisma.surveyResponse.deleteMany({
        where: { surveyInstanceId: { in: responseSurveyIds } },
      })
    : { count: 0 };

  return {
    piiRetentionDays: PII_RETENTION_DAYS,
    responseRetentionYears: RESPONSE_RETENTION_YEARS,
    surveysRedacted: surveyIds.length,
    invitationsRedacted,
    mailLogsDeleted,
    eventParticipantsDeleted,
    surveysWithResponsesDeleted: responseSurveyIds.length,
    responsesDeleted: responsesDeleted.count,
  };
}
