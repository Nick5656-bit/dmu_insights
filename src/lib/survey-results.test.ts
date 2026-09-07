import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeQuestion, resultsCsv, buildQuestionBenchmarks, responseRate, type ResultQuestion, type ResultAnswer } from "./survey-results";

const scale: ResultQuestion = { id: "q", title: "Anbefaling", questionType: "SCALE_1_5", benchmarkKey: "RECOMMENDATION", options: [] };
const choice: ResultQuestion = { ...scale, questionType: "SINGLE_CHOICE", benchmarkKey: null, options: [{ label: "Ja", value: "yes" }, { label: "Nej", value: "no" }] };
const text: ResultQuestion = { ...scale, questionType: "TEXT", benchmarkKey: null };
const answers = (count: number): ResultAnswer[] => Array.from({ length: count }, (_, index) => ({ surveyResponseId: `r${index}`, numericValue: 1, optionValue: "yes", textValue: `Hemmeligt ${index}` }));

for (const question of [scale, choice, text]) {
  for (const count of [0, 1, 4]) test(`${question.questionType}: ${count} answers never reach browser/export`, () => {
    const result = summarizeQuestion(question, answers(count));
    assert.equal(result.suppressed, true);
    assert.equal(result.avg, null);
    assert.equal(result.count, 0);
    assert.deepEqual(result.distribution, []);
    assert.deepEqual(result.texts, []);
    assert.ok(!JSON.stringify(result).includes("Hemmeligt"));
    assert.ok(!resultsCsv([result], "test").includes("Hemmeligt"));
  });
}
test("five distinct answers unlock scales, choices and all text questions", () => {
  assert.equal(summarizeQuestion(scale, answers(5)).avg, 1);
  assert.deepEqual(summarizeQuestion(choice, answers(5)).distribution, [{ label: "Ja", value: 5 }, { label: "Nej", value: 0 }]);
  const result = summarizeQuestion(text, answers(5));
  assert.equal(result.texts.length, 5);
  assert.deepEqual(Object.keys(result.texts[0]), ["text"]);
  assert.equal(result.suppressed, false);
});
test("duplicates, blanks and invalid numeric values cannot unlock a small group", () => {
  assert.equal(summarizeQuestion(scale, [...answers(4), answers(1)[0]]).suppressed, true);
  assert.equal(summarizeQuestion(text, [...answers(4), { ...answers(6)[5], textValue: "  " }]).suppressed, true);
  assert.equal(summarizeQuestion(scale, [...answers(4), { ...answers(6)[5], numericValue: 6 }]).suppressed, true);
});
test("benchmark requires five actual answers on both sides of the same question", () => {
  const safe = summarizeQuestion(scale, answers(5));
  const unsafe = summarizeQuestion(scale, answers(1));
  assert.deepEqual(buildQuestionBenchmarks([safe], [unsafe]), []);
  assert.deepEqual(buildQuestionBenchmarks([unsafe], [safe]), []);
  assert.equal(buildQuestionBenchmarks([safe], [safe]).length, 1);
});
test("CSV includes choice labels and text, protects formulas and multiline content", () => {
  const result = summarizeQuestion(text, answers(5).map((answer) => ({ ...answer, textValue: '=HYPERLINK("bad")\nline;two' })));
  const csv = resultsCsv([summarizeQuestion(choice, answers(5)), result], "test");
  assert.ok(csv.includes('"Ja";"5"'));
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes('""bad""'));
  assert.ok(!csv.includes("surveyResponseId"));
});
test("event response rate uses delivered invitations, not club membership", () => {
  assert.equal(responseRate(20, 40), 50);
  assert.equal(responseRate(0, 40), 0);
  assert.equal(responseRate(5, 0), null);
  assert.equal(responseRate(5, 4), null);
});
