import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { summarizeQuestion, type ResultAnswer } from "./survey-results";
import { overviewQuestions, type OverviewSeries } from "./result-overview";

export async function loadResultOverview(responseWhere: Prisma.SurveyResponseWhereInput, instanceWhere: Prisma.SurveyInstanceWhereInput): Promise<OverviewSeries[]> {
  const instances = await prisma.surveyInstance.findMany({
    where: instanceWhere,
    select: { id: true, name: true, sentAt: true, createdAt: true, event: { select: { eventDate: true } }, club: { select: { name: true } } },
    orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
  });
  if (!instances.length) return [];
  const questions = await prisma.question.findMany({
    where: { questionType: "SCALE_1_5", instanceQuestions: { some: { surveyInstance: instanceWhere } } },
    select: { id: true, title: true, questionType: true, benchmarkKey: true },
    orderBy: { createdAt: "asc" },
  });
  const answers = await prisma.surveyAnswer.findMany({
    where: { questionId: { in: questions.map(q => q.id) }, surveyResponse: {
      AND: [responseWhere, { surveyInstance: instanceWhere, surveyInstanceId: { in: instances.map(s => s.id) } }],
    } },
    select: { questionId: true, surveyResponseId: true, numericValue: true, surveyResponse: { select: { surveyInstanceId: true } } },
  });
  const grouped = new Map<string, Map<string, ResultAnswer[]>>();
  for (const answer of answers) {
    const id = answer.surveyResponse.surveyInstanceId;
    const byQuestion = grouped.get(id) ?? new Map<string, ResultAnswer[]>();
    const group = byQuestion.get(answer.questionId) ?? [];
    group.push({ surveyResponseId: answer.surveyResponseId, numericValue: answer.numericValue, optionValue: null, textValue: null });
    byQuestion.set(answer.questionId, group);
    grouped.set(id, byQuestion);
  }
  return instances.map(instance => ({
    id: instance.id,
    date: (instance.event?.eventDate ?? instance.sentAt ?? instance.createdAt).toISOString(),
    label: `${instance.name} · ${instance.club.name} · ${(instance.event?.eventDate ?? instance.sentAt ?? instance.createdAt).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen" })}`,
    questions: overviewQuestions(questions.map(q => summarizeQuestion({ ...q, options: [] }, grouped.get(instance.id)?.get(q.id) ?? []))),
  }));
}
