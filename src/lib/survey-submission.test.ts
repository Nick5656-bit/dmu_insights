import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSurveySubmission, nextStepIndex, type SubmissionQuestion } from "./survey-submission";

const question: SubmissionQuestion = { questionId: "q", required: true, question: { questionType: "SCALE_1_5", options: [] } };
function form() {
  const data = new FormData();
  data.set("segment_respondentAgeGroup", "AGE_18_30");
  data.set("segment_respondentRole", "RIDER");
  data.set("segment_motocrossClass", "C_MX2");
  return data;
}
test("a skipped required question is identified even when the last question has an answer", () => {
  const data = form();
  data.set("question_last", "5");
  assert.deepEqual(parseSurveySubmission(data, [question, { ...question, questionId: "last" }]), { error: "Besvar venligst dette spørgsmål, før du indsender.", questionId: "q" });
});
test("invalid choices, scales, missing segments and long text return explicit errors", () => {
  const data = form();
  data.set("question_q", "6");
  assert.ok("error" in parseSurveySubmission(data, [question]));
  data.set("question_q", "old-choice");
  assert.ok("error" in parseSurveySubmission(data, [{ ...question, question: { questionType: "SINGLE_CHOICE", options: [{ value: "yes" }] } }]));
  data.set("question_q", "x".repeat(5001));
  assert.ok("error" in parseSurveySubmission(data, [{ ...question, question: { questionType: "TEXT", options: [] } }]));
  data.delete("segment_motocrossClass");
  assert.ok("error" in parseSurveySubmission(data, []));
});
test("voluntary blanks are allowed and non-riders do not get a made-up riding class", () => {
  const data = form();
  data.set("segment_respondentRole", "PARENT_GUARDIAN");
  const result = parseSurveySubmission(data, [{ ...question, required: false }]);
  assert.ok("data" in result);
  if ("data" in result) {
    assert.deepEqual(result.data.answers, []);
    assert.equal(result.data.motocrossClass, "NOT_APPLICABLE");
  }
});
test("an auto-advance timer and a double click cannot advance the same step twice", () => {
  const index = nextStepIndex(3, 3, 8);
  assert.equal(index, 4);
  assert.equal(nextStepIndex(index, 3, 8), 4);
  assert.equal(nextStepIndex(2, 3, 8), 2); // A timer firing after Back.
  assert.equal(nextStepIndex(7, 7, 8), 7);
});
