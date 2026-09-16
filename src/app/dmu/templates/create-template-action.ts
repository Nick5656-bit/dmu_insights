"use server";

import { SurveyType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { CreateTemplateState } from "./create-template-state";

const schema = z.object({
  requestId: z.string().uuid(),
  name: z.string().trim().min(3, "Navnet skal være mindst 3 tegn."),
  description: z.string().trim().min(1, "Udfyld en beskrivelse."),
  surveyType: z.nativeEnum(SurveyType),
  questionIds: z.array(z.string().min(1)).min(1, "Vælg mindst ét spørgsmål."),
});

export async function createTemplateAction(_previous: CreateTemplateState, formData: FormData): Promise<CreateTemplateState> {
  let templateId: string;
  try {
    const session = await getSession();
    if (!session || session.role !== "DMU_ADMIN") {
      return { status: "error", message: "Du skal være logget ind som DMU-administrator. Log ind igen i en ny fane og prøv derefter igen." };
    }
    const parsed = schema.safeParse({
      requestId: formData.get("requestId"),
      name: formData.get("name"),
      description: formData.get("description"),
      surveyType: formData.get("surveyType"),
      questionIds: [...new Set(formData.getAll("questionIds").map(String))],
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const message = issue.path[0] === "requestId" ? "Formularen kunne ikke genkendes. Genindlæs siden og prøv igen."
        : issue.path[0] === "surveyType" ? "Vælg en gyldig spørgeskematype." : issue.message;
      return { status: "error", message };
    }
    const { requestId, name, description, surveyType, questionIds } = parsed.data;
    // Reuse this ID for retries, including a lost response after a successful save.
    // The primary key also protects against two concurrent submissions.
    const existing = await prisma.surveyTemplate.findUnique({ where: { id: requestId },
      include: { templateQuestions: { orderBy: { sortOrder: "asc" } } } });
    if (existing) {
      if (existing.name !== name || existing.description !== description || existing.surveyType !== surveyType ||
          JSON.stringify(existing.templateQuestions.map(q => q.questionId)) !== JSON.stringify(questionIds)) {
        return { status: "error", message: "Denne oprettelse er allerede gemt med andet indhold. Genindlæs siden og find skabelonen i listen." };
      }
      templateId = existing.id;
    } else {
      const questions = await prisma.question.findMany({
        where: { id: { in: questionIds }, scope: "DMU_STANDARD", active: true },
        select: { id: true, benchmarkKey: true },
      });
      if (questions.length !== questionIds.length) {
        return { status: "error", message: "Et eller flere af de valgte spørgsmål er ikke længere tilgængelige. Genindlæs siden og kontrollér dit valg." };
      }
      const byId = new Map(questions.map(q => [q.id, q]));
      const rows = questionIds.map((questionId, index) => ({ questionId, sortOrder: index + 1,
        required: true, isCoreBenchmarkQuestion: Boolean(byId.get(questionId)?.benchmarkKey) }));
      // One atomic nested write: never leave a template with missing questions/layout.
      await prisma.surveyTemplate.create({ data: {
        id: requestId, name, description, surveyType, isActive: false,
        templateQuestions: { create: rows },
        layoutJson: { version: 1, items: rows.map(row => ({ id: `question-${row.questionId}`, kind: "QUESTION",
          questionId: row.questionId, required: row.required, isCore: row.isCoreBenchmarkQuestion })) },
      } });
      templateId = requestId;
    }
  } catch {
    // Keep submitted values on the client and allow a safe retry using the same ID.
    return { status: "error", message: "Skabelonen kunne ikke bekræftes gemt. Dine indtastninger er bevaret. Prøv igen — samme oprettelse bliver ikke gemt to gange." };
  }
  revalidatePath("/dmu/templates");
  return { status: "success", message: "Skabelonen er oprettet.", templateId };
}
