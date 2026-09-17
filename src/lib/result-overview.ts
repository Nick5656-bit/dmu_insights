import { SUPPRESSION_THRESHOLD, type QuestionResult } from "./survey-results";

export type OverviewQuestion = { id: string; title: string; category: string; sum: number; count: number };
export type OverviewSeries = { id: string; label: string; questions: OverviewQuestion[] };

// Only independently eligible question totals cross the server/client boundary.
export function overviewQuestions(results: QuestionResult[]): OverviewQuestion[] {
  return results.filter(q => q.questionType === "SCALE_1_5" && !q.suppressed && q.count >= SUPPRESSION_THRESHOLD)
    .map(q => ({ id: q.questionId, title: q.questionTitle, category: q.category,
      sum: q.distribution.reduce((sum, bin) => sum + Number(bin.label) * bin.value, 0), count: q.count }));
}

export function buildResultOverview(series: OverviewSeries[]) {
  // Compare identical questions, never category names alone. All selected
  // events must independently meet the threshold for each included question.
  const shared = (series[0]?.questions ?? []).filter(q => series.every(s => s.questions.some(other => other.id === q.id && other.count >= SUPPRESSION_THRESHOLD)));
  const categories = [...new Set(shared.map(q => q.category))];
  const includedIds = new Set(shared.map(q => q.id));
  const means = series.map((s, index) => {
    const questions = s.questions.filter(q => includedIds.has(q.id));
    const count = questions.reduce((sum, q) => sum + q.count, 0);
    return { key: `series${index}`, label: s.label, value: count ? questions.reduce((sum, q) => sum + q.sum, 0) / count : null };
  });
  const rows = categories.map(category => {
    const row: Record<string, string | number> = { category };
    series.forEach((s, index) => {
      const questions = s.questions.filter(q => includedIds.has(q.id) && q.category === category);
      const count = questions.reduce((sum, q) => sum + q.count, 0);
      if (count) row[`series${index}`] = questions.reduce((sum, q) => sum + q.sum, 0) / count;
    });
    return row;
  });
  return { rows, means, questions: shared };
}
