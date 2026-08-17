export const REMINDER_DELAY_DAYS = 3;
export const REMINDER_CLOSE_BUFFER_HOURS = 24;

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function getReminderScheduledAt(initialSentAt: Date) {
  return addHours(initialSentAt, REMINDER_DELAY_DAYS * 24);
}

export function canScheduleReminder(closesAt: Date | null, initialSentAt: Date) {
  if (!closesAt) {
    return true;
  }

  const latestAcceptableReminderTime = addHours(
    getReminderScheduledAt(initialSentAt),
    REMINDER_CLOSE_BUFFER_HOURS
  );

  return closesAt.getTime() > latestAcceptableReminderTime.getTime();
}

export function shouldSkipSurveyReminder({
  invitationStatus,
  surveyStatus,
  closesAt,
  now,
}: {
  invitationStatus: "CREATED" | "SENT" | "OPENED" | "ANSWERED";
  surveyStatus: "DRAFT" | "SCHEDULED" | "SENT" | "CLOSED";
  closesAt: Date | null;
  now: Date;
}) {
  if (invitationStatus === "ANSWERED" || surveyStatus !== "SENT") {
    return true;
  }

  return Boolean(closesAt && closesAt.getTime() <= addHours(now, REMINDER_CLOSE_BUFFER_HOURS).getTime());
}
