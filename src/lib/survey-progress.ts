type Step = { kind: "INTRO" | "HEADING" | "SEGMENT" | "QUESTION" };

// Count only answerable, visible steps. Intro and section headings do not
// inflate the total; the conditional class question is counted only if shown.
export function surveyProgress(steps: readonly Step[], currentIndex: number) {
  const answerable = (step: Step) => step.kind === "SEGMENT" || step.kind === "QUESTION";
  const total = steps.filter(answerable).length;
  const position = steps.slice(0, Math.max(0, currentIndex + 1)).filter(answerable).length;
  return { total, position, percent: total ? Math.round(position / total * 100) : 0 };
}
