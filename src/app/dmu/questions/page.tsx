import { QuestionType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { QuestionEditCard } from "./question-edit-card";

const createQuestionSchema = z.object({
  title: z.string().trim().min(3),
  description: z.string().trim().optional(),
  questionType: z.nativeEnum(QuestionType),
  benchmarkKey: z.string().trim().optional(),
  optionsRaw: z.string().trim().optional(),
});

const editQuestionSchema = z.object({
  questionId: z.string(),
  title: z.string().trim().min(3),
  description: z.string().trim().optional(),
  questionType: z.nativeEnum(QuestionType),
  benchmarkKey: z.string().trim().optional(),
  optionsRaw: z.string().trim().optional(),
});

const questionTypeLabels: Record<QuestionType, string> = {
  SCALE_1_5: "Skala 1-5",
  SINGLE_CHOICE: "Valgmuligheder",
  TEXT: "Tekst",
};

export default async function DmuQuestionsPage() {
  await requireRole("DMU_ADMIN");

  const questions = await prisma.question.findMany({
    where: { scope: "DMU_STANDARD" },
    include: { options: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  async function createQuestionAction(formData: FormData) {
    "use server";
    await requireRole("DMU_ADMIN");

    const parsed = createQuestionSchema.safeParse({
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      questionType: String(formData.get("questionType") ?? "") as QuestionType,
      benchmarkKey: String(formData.get("benchmarkKey") ?? ""),
      optionsRaw: String(formData.get("optionsRaw") ?? ""),
    });

    if (!parsed.success) {
      return;
    }

    const data = parsed.data;
    const options =
      data.questionType === "SINGLE_CHOICE"
        ? (data.optionsRaw ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];

    if (data.questionType === "SINGLE_CHOICE" && options.length < 2) {
      return;
    }

    const createdQuestion = await prisma.question.create({
      data: {
        title: data.title,
        description: data.description || null,
        questionType: data.questionType,
        scope: "DMU_STANDARD",
        benchmarkKey: data.benchmarkKey || null,
        active: true,
      },
    });

    if (options.length > 0) {
      await prisma.questionOption.createMany({
        data: options.map((label, index) => ({
          questionId: createdQuestion.id,
          label,
          value: label.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, ""),
          sortOrder: index + 1,
        })),
      });
    }

    revalidatePath("/dmu/questions");
  }

  async function toggleQuestionActiveAction(formData: FormData) {
    "use server";
    await requireRole("DMU_ADMIN");

    const questionId = String(formData.get("questionId") ?? "");
    const nextActive = String(formData.get("nextActive") ?? "") === "true";
    if (!questionId) {
      return;
    }

    await prisma.question.update({
      where: { id: questionId },
      data: { active: nextActive },
    });

    revalidatePath("/dmu/questions");
  }

  async function editQuestionAction(formData: FormData) {
    "use server";
    await requireRole("DMU_ADMIN");

    const parsed = editQuestionSchema.safeParse({
      questionId: String(formData.get("questionId") ?? ""),
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      questionType: String(formData.get("questionType") ?? "") as QuestionType,
      benchmarkKey: String(formData.get("benchmarkKey") ?? ""),
      optionsRaw: String(formData.get("optionsRaw") ?? ""),
    });

    if (!parsed.success) {
      return;
    }

    const data = parsed.data;
    const options =
      data.questionType === "SINGLE_CHOICE"
        ? (data.optionsRaw ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];

    if (data.questionType === "SINGLE_CHOICE" && options.length < 2) {
      return;
    }

    // Update question
    await prisma.question.update({
      where: { id: data.questionId },
      data: {
        title: data.title,
        description: data.description || null,
        questionType: data.questionType,
        benchmarkKey: data.benchmarkKey || null,
      },
    });

    // Delete and recreate options
    await prisma.questionOption.deleteMany({
      where: { questionId: data.questionId },
    });

    if (options.length > 0) {
      await prisma.questionOption.createMany({
        data: options.map((label, index) => ({
          questionId: data.questionId,
          label,
          value: label.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, ""),
          sortOrder: index + 1,
        })),
      });
    }

    revalidatePath("/dmu/questions");
  }

  async function deleteQuestionAction(questionId: string) {
    "use server";
    await requireRole("DMU_ADMIN");

    if (!questionId) {
      throw new Error("Question ID is required");
    }

    // Check if question is used in templates
    const usageCount = await prisma.surveyTemplateQuestion.count({
      where: { questionId },
    });

    // Also check if it's used in any survey instances
    const instanceUsageCount = await prisma.surveyInstanceQuestion.count({
      where: { questionId },
    });

    if (usageCount > 0 || instanceUsageCount > 0) {
      throw new Error("Spørgsmålet bruges allerede i skabeloner eller surveys. Fjern det fra disse først.");
    }

    // Delete options first (due to FK constraint)
    await prisma.questionOption.deleteMany({
      where: { questionId },
    });

    // Delete question
    await prisma.question.delete({
      where: { id: questionId },
    });

    revalidatePath("/dmu/questions");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">DMU standardspørgsmål</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Opret sammenlignelige spørgsmål, som klubberne kan bruge i skabeloner.
        </p>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Opret nyt standardspørgsmål</h3>
        <form action={createQuestionAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium" htmlFor="title">
              Spørgsmålstekst
            </label>
            <input id="title" name="title" required className="w-full rounded-md border px-3 py-2 text-sm" />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium" htmlFor="description">
              Beskrivelse (valgfri)
            </label>
            <input id="description" name="description" className="w-full rounded-md border px-3 py-2 text-sm" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="questionType">
              Type
            </label>
            <select id="questionType" name="questionType" defaultValue="SCALE_1_5" className="w-full rounded-md border px-3 py-2 text-sm">
              <option value="SCALE_1_5">Skala 1-5</option>
              <option value="SINGLE_CHOICE">Valgmuligheder</option>
              <option value="TEXT">Tekst</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="benchmarkKey">
              Sammenligningsnøgle (valgfri)
            </label>
            <input id="benchmarkKey" name="benchmarkKey" className="w-full rounded-md border px-3 py-2 text-sm" placeholder="fx SATISFACTION_OVERALL" />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium" htmlFor="optionsRaw">
              Svarmuligheder (kommasepareret)
            </label>
            <input id="optionsRaw" name="optionsRaw" className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Meget positivt, Positivt, Neutralt" />
          </div>

          <div className="md:col-span-2">
            <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Opret spørgsmål
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Eksisterende standardspørgsmål</h3>
        <div className="mt-4 space-y-3">
          {questions.map((question) => (
            <QuestionEditCard
              key={question.id}
              question={question}
              onEdit={editQuestionAction}
              onDelete={deleteQuestionAction}
              onToggleActive={toggleQuestionActiveAction}
            />
          ))}
          {questions.length === 0 ? <p className="text-sm text-muted-foreground">Ingen standardspørgsmål endnu.</p> : null}
        </div>
      </section>
    </div>
  );
}
