import type { Prisma, QuestionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const QUESTION_LOCKED_MESSAGE = "Spørgsmålet er allerede brugt og er låst for at bevare de oprindelige svar. Opret en kopi for at ændre det.";
export type QuestionEditResult = { error?: string };

type Definition = { title: string; description: string | null; questionType: QuestionType; benchmarkKey?: string | null };

export async function editUnusedQuestion(id: string, ownership: Prisma.QuestionWhereInput, definition: Definition, labels: string[]): Promise<QuestionEditResult> {
  return prisma.$transaction(async (tx) => {
    // Also serialize against FK inserts of new survey questions/answers.
    await tx.$queryRaw`SELECT id FROM "Question" WHERE id = ${id} FOR UPDATE`;
    const question = await tx.question.findFirst({ where: { AND: [{ id }, ownership] }, include: { _count: { select: { instanceQuestions: true, answers: true } } } });
    if (!question) return { error: "Spørgsmålet findes ikke, eller du har ikke adgang." };
    if (question._count.instanceQuestions > 0 || question._count.answers > 0) return { error: QUESTION_LOCKED_MESSAGE };
    await tx.question.update({ where: { id }, data: {
      ...definition,
      options: { deleteMany: {}, create: labels.map((label, index) => ({ label, value: `OPTION_${index + 1}`, sortOrder: index + 1 })) },
    } });
    return {};
  });
}

export async function deleteUnusedQuestion(id: string, ownership: Prisma.QuestionWhereInput) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Question" WHERE id = ${id} FOR UPDATE`;
    const question = await tx.question.findFirst({ where: { AND: [{ id }, ownership] }, include: { _count: { select: { instanceQuestions: true, templateQuestions: true, answers: true } } } });
    if (!question) throw new Error("Spørgsmålet findes ikke, eller du har ikke adgang.");
    if (Object.values(question._count).some((count) => count > 0)) throw new Error(QUESTION_LOCKED_MESSAGE);
    await tx.question.delete({ where: { id } });
  });
}

export async function copyQuestion(id: string, ownership: Prisma.QuestionWhereInput) {
  return prisma.$transaction(async (tx) => {
    const question = await tx.question.findFirst({ where: { AND: [{ id }, ownership] }, include: { options: true } });
    if (!question) throw new Error("Spørgsmålet findes ikke, eller du har ikke adgang.");
    return tx.question.create({ data: {
      title: `${question.title} (kopi)`, description: question.description, questionType: question.questionType,
      scope: question.scope, createdByClubId: question.createdByClubId, benchmarkKey: question.benchmarkKey,
      options: { create: question.options.map(({ label, value, sortOrder }) => ({ label, value, sortOrder })) },
    } });
  });
}
