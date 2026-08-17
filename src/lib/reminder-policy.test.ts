import assert from "node:assert/strict";
import test from "node:test";
import { canScheduleReminder, getReminderScheduledAt, shouldSkipSurveyReminder } from "./reminder-policy";

const initialSentAt = new Date("2026-08-17T16:00:00.000Z");

test("a reminder is scheduled three days after the initial invitation", () => {
  assert.equal(getReminderScheduledAt(initialSentAt).toISOString(), "2026-08-20T16:00:00.000Z");
});

test("a reminder is not scheduled when the survey closes within 24 hours of it", () => {
  assert.equal(canScheduleReminder(new Date("2026-08-21T16:00:00.000Z"), initialSentAt), false);
  assert.equal(canScheduleReminder(new Date("2026-08-21T16:00:01.000Z"), initialSentAt), true);
});

test("answered, closed, and soon-closing surveys never receive reminders", () => {
  const now = new Date("2026-08-20T16:00:00.000Z");

  assert.equal(
    shouldSkipSurveyReminder({ invitationStatus: "ANSWERED", surveyStatus: "SENT", closesAt: null, now }),
    true
  );
  assert.equal(
    shouldSkipSurveyReminder({ invitationStatus: "OPENED", surveyStatus: "CLOSED", closesAt: null, now }),
    true
  );
  assert.equal(
    shouldSkipSurveyReminder({
      invitationStatus: "SENT",
      surveyStatus: "SENT",
      closesAt: new Date("2026-08-21T16:00:00.000Z"),
      now,
    }),
    true
  );
  assert.equal(
    shouldSkipSurveyReminder({
      invitationStatus: "OPENED",
      surveyStatus: "SENT",
      closesAt: new Date("2026-08-21T16:00:01.000Z"),
      now,
    }),
    false
  );
});
