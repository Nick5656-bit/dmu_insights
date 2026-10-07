// Synthetic data only. Never connects to the database or exports pilot responses.
import { mkdir, writeFile } from "node:fs/promises";
import { renderResultsPdf } from "../src/lib/results-pdf";
import { overviewQuestions } from "../src/lib/result-overview";
import type { QuestionResult } from "../src/lib/survey-results";

async function main() {
  const questions: QuestionResult[] = [
    ...["Hvor tilfreds var du samlet set med arrangementet?", "Hvor tilfreds var du med den praktiske afvikling af løbsdagen?", "Hvor tilfreds var du med sikkerheden, som du oplevede den på dagen?", "Hvor tilfreds var du med baneforholdene?"].map((questionTitle, i) => ({
      questionId: String(i), questionTitle, questionType: "SCALE_1_5" as const, category: ["Overordnet", "Overordnet", "Sikkerhed", "Bane"][i], benchmarkKey: null,
      avg: 4.1, count: 20, suppressed: false, distribution: [{ label: "1", value: 1 }, { label: "2", value: 1 }, { label: "3", value: 2 }, { label: "4", value: 7 }, { label: "5", value: 9 }], texts: [],
    })),
    { questionId: "choice", questionTitle: "Hvad var vigtigst for din oplevelse?", questionType: "SINGLE_CHOICE", category: "Oplevelse", benchmarkKey: null, count: 20, avg: null, suppressed: false, texts: [], distribution: [{ label: "Banens kvalitet og muligheden for at udvikle sig sammen med andre kørere", value: 12 }, { label: "Fællesskabet", value: 8 }] },
    { questionId: "text", questionTitle: "Hvad fungerede særligt godt, som vi bør holde fast i næste gang?", questionType: "TEXT", category: "Åbne svar", benchmarkKey: null, avg: null, count: 8, suppressed: false, distribution: [], texts: [
      { text: "God stemning og gode forhold på banen. Æ, Ø og Å skal være læselige - også i København og på Sjælland." },
      { text: "Et længere testsvar, der skal kunne fortsætte på næste side uden at ramme sidehovedet eller sidetallet. ".repeat(35) },
      ...Array.from({ length: 6 }, () => ({ text: "Tak for en god dag med mulighed for at lære og udvikle sig." })),
    ] },
    { questionId: "hidden", questionTitle: "Beskyttet spørgsmål", questionType: "TEXT", category: "Åbne svar", benchmarkKey: null, avg: null, count: 0, suppressed: true, distribution: [], texts: [] },
  ];
  await mkdir("tmp/pdfs", { recursive: true });
  await writeFile("tmp/pdfs/resultater-tomt.pdf", await renderResultsPdf({ scope: "TESTDATA - Tomt udsnit", filters: ["Alle aldre"], results: [], series: [], comparison: false }));
  for (const comparison of [false, true]) {
    const series = [{ id: "a", label: comparison ? "Testløb A - Herning Motocross Klub" : "Samlede resultater", questions: overviewQuestions(questions) }];
    if (comparison) series.push({ id: "b", label: "Testløb B - klubarrangement med et længere navn", questions: overviewQuestions(questions).map(q => ({ ...q, sum: q.sum - 10 })) });
    await writeFile(`tmp/pdfs/resultater-${comparison ? "sammenligning" : "samlet"}.pdf`, await renderResultsPdf({
      scope: "TESTDATA - Herning Motocross Klub · Alle år", generatedAt: new Date("2026-10-07T10:00:00Z"),
      filters: ["Arrangementer: Testløb A; Testløb B", "Alder: Alle aldre", "Klasse: Alle klasser", "Rolle: Alle roller"],
      results: questions, series, comparison,
    }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
