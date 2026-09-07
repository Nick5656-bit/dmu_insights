import { QuestionDistributionBoard } from "@/components/charts/question-distribution-board";
import { OpenTextQuestionSelect } from "@/components/open-text-question-select";
import { TextResponsesModal } from "@/components/text-responses-modal";
import { SUPPRESSION_THRESHOLD, type QuestionResult } from "@/lib/survey-results";

export function SurveyResultsPanel({ results, textQuestionId }: { results: QuestionResult[]; textQuestionId?: string }) {
  const chartRows = results.filter((result) => result.questionType !== "TEXT");
  const textRows = results.filter((result) => result.questionType === "TEXT" && !result.suppressed);
  const selected = textRows.find((result) => result.questionId === textQuestionId) ?? textRows[0];
  return <>
    <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
      <h2 className="font-heading text-2xl font-semibold">Spørgsmålsfordeling</h2>
      <p className="mt-2 mb-5 text-sm text-muted-foreground">Skala- og valgspørgsmål i det valgte udsnit. Mindst {SUPPRESSION_THRESHOLD} besvarelser pr. spørgsmål.</p>
      <QuestionDistributionBoard rows={chartRows} suppressionThreshold={SUPPRESSION_THRESHOLD} />
    </section>
    <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
      <h2 className="font-heading text-2xl font-semibold">Åbne svar</h2>
      {selected ? <>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <OpenTextQuestionSelect questions={textRows.map((result) => ({ id: result.questionId, title: result.questionTitle }))} selectedQuestionId={selected.questionId} />
          <TextResponsesModal questionTitle={selected.questionTitle} responses={selected.texts} showMetadata={false} />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{selected.count} svar. Vises uden tidspunkt og deltageroplysninger.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {selected.texts.slice(0, 3).map((entry, index) => <p key={index} className="rounded-2xl border p-4 text-sm leading-6">{entry.text}</p>)}
        </div>
      </> : <p className="mt-4 text-sm text-muted-foreground">Fritekstsvar vises, når mindst {SUPPRESSION_THRESHOLD} har besvaret det samme spørgsmål i det valgte udsnit.</p>}
    </section>
  </>;
}
