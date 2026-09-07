import { isRespondentAgeGroup, isRespondentRole, isSelectableMotocrossClass, roleNeedsMotocrossClass } from "./survey-segments";

export type SubmissionQuestion = {
  questionId: string;
  required: boolean;
  question: { questionType: "SCALE_1_5" | "SINGLE_CHOICE" | "TEXT"; options: { value: string }[] };
};
export type SubmissionError = { error: string; questionId?: string; segment?: string; success?: false };
export type SubmissionResult = SubmissionError | { success: true; error?: never };

export function parseSurveySubmission(formData: FormData, questions: SubmissionQuestion[]) {
  const respondentAgeGroup = String(formData.get("segment_respondentAgeGroup") ?? "");
  const respondentRole = String(formData.get("segment_respondentRole") ?? "");
  const rawClass = String(formData.get("segment_motocrossClass") ?? "");
  if (!isRespondentAgeGroup(respondentAgeGroup) || respondentAgeGroup === "NOT_REPORTED")
    return { error: "Vælg venligst en aldersgruppe.", segment: "respondentAgeGroup" } as SubmissionError;
  if (!isRespondentRole(respondentRole) || respondentRole === "NOT_REPORTED")
    return { error: "Vælg venligst din rolle.", segment: "respondentRole" } as SubmissionError;
  const motocrossClass = roleNeedsMotocrossClass(respondentRole) ? isSelectableMotocrossClass(rawClass) ? rawClass : null : "NOT_APPLICABLE";
  if (!motocrossClass) return { error: "Vælg venligst din primære motocrossklasse.", segment: "motocrossClass" } as SubmissionError;
  const answers: { questionId: string; numericValue?: number; optionValue?: string; textValue?: string }[] = [];
  for (const item of questions) {
    const raw = String(formData.get(`question_${item.questionId}`) ?? "").trim();
    const fail = (error: string): SubmissionError => ({ error, questionId: item.questionId });
    if (!raw) {
      if (item.required) return fail("Besvar venligst dette spørgsmål, før du indsender.");
      continue;
    }
    if (item.question.questionType === "SCALE_1_5") {
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 1 || value > 5) return fail("Vælg et tal fra 1 til 5.");
      answers.push({ questionId: item.questionId, numericValue: value });
    } else if (item.question.questionType === "SINGLE_CHOICE") {
      if (!item.question.options.some((option) => option.value === raw)) return fail("Vælg en gyldig svarmulighed. Genindlæs siden, hvis mulighederne er ændret.");
      answers.push({ questionId: item.questionId, optionValue: raw });
    } else {
      if (raw.length > 5000) return fail("Dit tekstsvar må højst fylde 5.000 tegn.");
      answers.push({ questionId: item.questionId, textValue: raw });
    }
  }
  return { data: { respondentAgeGroup, respondentRole, motocrossClass, answers } };
}

// A timer and a quick double-click for the same step may only advance once.
export function nextStepIndex(currentIndex: number, expectedIndex: number, total: number) {
  return currentIndex === expectedIndex ? Math.min(expectedIndex + 1, Math.max(0, total - 1)) : currentIndex;
}
