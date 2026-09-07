import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { summarizeQuestion, type ResultAnswer } from "@/lib/survey-results";

export async function loadSurveyResults(
  responseWhere: Prisma.SurveyResponseWhereInput,
  instanceWhere: Prisma.SurveyInstanceWhereInput,
) {
  const questions = await prisma.question.findMany({
    where: { OR: [
      { instanceQuestions: { some: { surveyInstance: instanceWhere } } },
      { answers: { some: { surveyResponse: responseWhere } } },
    ] },
    select: {
      id: true, title: true, questionType: true, benchmarkKey: true,
      options: { select: { label: true, value: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
  const answers = await prisma.surveyAnswer.findMany({
    where: { surveyResponse: responseWhere, questionId: { in: questions.map((question) => question.id) } },
    select: { questionId: true, surveyResponseId: true, numericValue: true, optionValue: true, textValue: true },
  });
  const grouped = new Map<string, ResultAnswer[]>();
  for (const answer of answers) {
    const group = grouped.get(answer.questionId) ?? [];
    group.push(answer);
    grouped.set(answer.questionId, group);
  }
  return questions.map((question) => summarizeQuestion(question, grouped.get(question.id) ?? []));
}
