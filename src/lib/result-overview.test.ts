import assert from "node:assert/strict";
import { test } from "node:test";
import { buildResultOverview, overviewQuestions, type OverviewSeries } from "./result-overview";
import { summarizeQuestion } from "./survey-results";

const question = (id: string, sum: number, count = 5, category = "Sikkerhed") => ({ id, title: id, sum, count, category });
test("one event shows categories and a response-weighted overall mean, without premature rounding", () => {
  const series = [{ id: "a", label: "A", questions: [question("q1", 25), question("q2", 10, 10), question("q3", 15, 5, "Bane")] }];
  const result = buildResultOverview(series);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].series0, 35 / 15);
  assert.equal(result.rows[1].series0, 3);
  assert.equal(result.means[0].value, 2.5);
});

test("multiple events use identical eligible questions, not matching category labels", () => {
  const series: OverviewSeries[] = [
    { id: "a", label: "A", questions: [question("shared", 20), question("own", 5)] },
    { id: "b", label: "B", questions: [question("shared", 15), question("different", 25)] },
  ];
  const result = buildResultOverview(series);
  assert.deepEqual(result.rows, [{ category: "Sikkerhed", series0: 4, series1: 3 }]);
  assert.deepEqual(result.means.map(m => m.value), [4, 3]);
  assert.deepEqual(result.questions.map(q => q.id), ["shared"]);
  assert.deepEqual(buildResultOverview([...series, { id: "small", label: "Small", questions: [] }]).rows, []);
  assert.deepEqual(buildResultOverview([]).rows, []);
});

test("four answers, duplicate responses, invalid values, text and unknown responses never enter chart totals", () => {
  const q = { id: "q", title: "Question", questionType: "SCALE_1_5" as const, benchmarkKey: null, options: [] };
  const answers = [1, 2, 3, 4].map(n => ({ surveyResponseId: `r${n}`, numericValue: n, optionValue: null, textValue: null }));
  const invalid = [...answers, answers[0], { ...answers[0], surveyResponseId: "unknown", numericValue: null }, { ...answers[0], surveyResponseId: "bad", numericValue: 6 }];
  assert.deepEqual(overviewQuestions([summarizeQuestion(q, invalid)]), []);
  const valid = summarizeQuestion(q, [...invalid, { ...answers[0], surveyResponseId: "r5", numericValue: 5 }]);
  assert.deepEqual(overviewQuestions([valid]), [{ id: "q", title: "Question", category: "Generel", sum: 15, count: 5 }]);
  assert.deepEqual(overviewQuestions([{ ...valid, questionType: "TEXT" }]), []);
});
