// Only the output of summarizeQuestion may cross the server/client boundary.
// Raw answers and response IDs must never be passed to a chart or export.
export const SUPPRESSION_THRESHOLD = 5;

export type ResultQuestion = {
  id: string;
  title: string;
  questionType: "SCALE_1_5" | "SINGLE_CHOICE" | "TEXT";
  benchmarkKey: string | null;
  options: { label: string; value: string }[];
};

export type ResultAnswer = {
  surveyResponseId: string;
  numericValue: number | null;
  optionValue: string | null;
  textValue: string | null;
};

export type QuestionResult = {
  questionId: string;
  questionTitle: string;
  questionType: ResultQuestion["questionType"];
  category: string;
  benchmarkKey: string | null;
  avg: number | null;
  count: number;
  suppressed: boolean;
  distribution: { label: string; value: number }[];
  texts: { text: string }[];
};

const categories: Record<string, string> = {
  SATISFACTION: "Tilfredshed", COMMUNITY: "Fællesskab", RECOMMENDATION: "Anbefaling",
  SAFETY: "Sikkerhed", ACTIVITY: "Aktivitetsudbytte", JOIN: "Motivation",
  CHURN: "Fastholdelse", DMU: "DMU centralt", GENEREL: "Generel",
};

export function summarizeQuestion(question: ResultQuestion, answers: ResultAnswer[]): QuestionResult {
  const category = question.benchmarkKey?.split("_")[0] ?? "GENEREL";
  const result: QuestionResult = {
    questionId: question.id, questionTitle: question.title, questionType: question.questionType,
    category: categories[category] ?? category, benchmarkKey: question.benchmarkKey,
    avg: null, count: 0, suppressed: true, distribution: [], texts: [],
  };
  // Count answered questions, not the total number of submitted surveys. A bad
  // historical duplicate must not make a group of four look like five people.
  const valid = answers.filter((answer) => {
    if (question.questionType === "SCALE_1_5") {
      return Number.isInteger(answer.numericValue) && answer.numericValue! >= 1 && answer.numericValue! <= 5;
    }
    if (question.questionType === "SINGLE_CHOICE") return Boolean(answer.optionValue?.trim());
    return Boolean(answer.textValue?.trim());
  });
  const unique = [...new Map(valid.map((answer) => [answer.surveyResponseId, answer])).values()];
  if (unique.length < SUPPRESSION_THRESHOLD) return result;

  result.suppressed = false;
  result.count = unique.length;
  if (question.questionType === "SCALE_1_5") {
    result.avg = Number((unique.reduce((sum, answer) => sum + answer.numericValue!, 0) / unique.length).toFixed(2));
    result.distribution = [1, 2, 3, 4, 5].map((score) => ({
      label: String(score), value: unique.filter((answer) => answer.numericValue === score).length,
    }));
  } else if (question.questionType === "SINGLE_CHOICE") {
    const labels = new Map(question.options.map((option) => [option.value, option.label]));
    // Keep historical choices visible even if an option was removed before
    // question locking was introduced. Never silently discard those answers.
    for (const answer of unique) if (!labels.has(answer.optionValue!)) labels.set(answer.optionValue!, answer.optionValue!);
    result.distribution = [...labels].map(([value, label]) => ({
      label, value: unique.filter((answer) => answer.optionValue === value).length,
    }));
  } else {
    // No timestamps, response IDs, club labels or cross-question ordering.
    result.texts = unique.map((answer) => ({ text: answer.textValue!.trim() }))
      .sort((a, b) => a.text.localeCompare(b.text, "da"));
  }
  return result;
}

export function buildQuestionBenchmarks(own: QuestionResult[], comparison: QuestionResult[]) {
  const byId = new Map(comparison.map((result) => [result.questionId, result]));
  return own.flatMap((result) => {
    const other = byId.get(result.questionId);
    if (!result.benchmarkKey || result.suppressed || other?.suppressed !== false || result.avg === null || other.avg === null) return [];
    return [{ label: result.questionTitle, own: result.avg, benchmark: other.avg }];
  });
}

export function responseRate(responses: number, invitations: number): number | null {
  // Missing or inconsistent historical invitation data is not a 0%/100% rate.
  if (invitations <= 0 || responses > invitations) return null;
  return Math.round((responses / invitations) * 100);
}

export function surveyYearWhere(year: number) {
  const range = { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
  return { OR: [{ sentAt: range }, { sentAt: null, createdAt: range }] };
}

export function resultsCsv(results: QuestionResult[], scope: string) {
  const rows: (string | number)[][] = [
    ["DMU Insights - resultater"], ["Udsnit", scope],
    ["Beskyttelse", `Mindst ${SUPPRESSION_THRESHOLD} besvarelser pr. spørgsmål i det valgte udsnit`], [],
    ["Kategori", "Spørgsmål", "Type", "Status", "Antal svar", "Gennemsnit", "Svarmulighed / tekst", "Antal for svarmulighed"],
  ];
  for (const result of results) {
    const prefix = [result.category, result.questionTitle, result.questionType];
    if (result.suppressed) { rows.push([...prefix, "Skjult: færre end 5 svar", "", "", "", ""]); continue; }
    const base = [...prefix, "Vises", result.count, result.avg ?? ""];
    if (result.questionType === "TEXT") {
      for (const entry of result.texts) rows.push([...base, entry.text, ""]);
    } else {
      for (const entry of result.distribution) rows.push([...base, entry.label, entry.value]);
    }
  }
  const cell = (value: string | number) => {
    const raw = String(value);
    const safe = /^[=+\-@]/.test(raw.trimStart()) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return `\uFEFF${rows.map((row) => row.map(cell).join(";")).join("\r\n")}\r\n`;
}
