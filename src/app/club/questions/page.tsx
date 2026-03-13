import { QuestionType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ClubQuestionEditCard } from "./club-question-edit-card";

const createQuestionSchema = z.object({
  title: z.string().trim().min(3),
  description: z.string().trim().optional(),
  questionType: z.nativeEnum(QuestionType),
  optionsRaw: z.string().trim().optional(),
});

const editQuestionSchema = z.object({
  questionId: z.string(),
  title: z.string().trim().min(3),
  description: z.string().trim().optional(),
  questionType: z.nativeEnum(QuestionType),
  optionsRaw: z.string().trim().optional(),
});

export default async function ClubQuestionsPage() {
  const session = await requireRole("CLUB_ADMIN");
  if (!session.clubId) {
    return (
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">Klubbens spørgsmål</h2>
        <p className="mt-2 text-sm text-muted-foreground">Brugeren mangler klubtilknytning.</p>
      </section>
    );
  }

  // Get custom questions created by this club
  const customQuestions = await prisma.question.findMany({
    where: { 
      scope: "CLUB_CUSTOM",
      createdByClubId: session.clubId
    },
    include: { 
      options: { orderBy: { sortOrder: "asc" } },
      _count: {
        select: {
          instanceQuestions: true,
        }
      }
    },
    orderBy: { createdAt: "desc" },
  });

  // Get all DMU standard questions for reference
  const dmuQuestions = await prisma.question.findMany({
    where: { scope: "DMU_STANDARD", active: true },
    include: { options: { orderBy: { sortOrder: "asc" } } },
    orderBy: { title: "asc" },
  });

  // Get survey instances that have used any custom questions from this club
  const surveysWithCustomQuestions = await prisma.surveyInstance.findMany({
    where: { 
      clubId: session.clubId,
      surveyInstanceQuestions: {
        some: {
          question: {
            scope: "CLUB_CUSTOM",
            createdByClubId: session.clubId
          }
        }
      }
    },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      surveyInstanceQuestions: {
        where: {
          question: {
            scope: "CLUB_CUSTOM",
            createdByClubId: session.clubId
          }
        },
        select: {
          questionId: true
        }
      }
    }
  });

  // Map sent survey IDs for easy lookup
  const sentSurveyIds = new Set(
    surveysWithCustomQuestions
      .filter(s => s.status === "SENT")
      .flatMap(s => s.surveyInstanceQuestions.map(sq => sq.questionId))
  );

  async function createQuestionAction(formData: FormData) {
    "use server";
    const currentSession = await requireRole("CLUB_ADMIN");
    if (!currentSession.clubId) {
      return;
    }

    const parsed = createQuestionSchema.safeParse({
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      questionType: String(formData.get("questionType") ?? "") as QuestionType,
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
        scope: "CLUB_CUSTOM",
        createdByClubId: currentSession.clubId,
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

    revalidatePath("/club/questions");
  }

  async function editQuestionAction(formData: FormData) {
    "use server";
    const currentSession = await requireRole("CLUB_ADMIN");
    if (!currentSession.clubId) {
      return;
    }

    const questionId = String(formData.get("questionId") ?? "");
    
    // Verify question belongs to this club
    const question = await prisma.question.findUnique({
      where: { id: questionId }
    });

    if (!question || question.createdByClubId !== currentSession.clubId) {
      return;
    }

    const parsed = editQuestionSchema.safeParse({
      questionId,
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      questionType: String(formData.get("questionType") ?? "") as QuestionType,
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

    revalidatePath("/club/questions");
  }

  async function deleteQuestionAction(questionId: string) {
    "use server";
    const currentSession = await requireRole("CLUB_ADMIN");
    if (!currentSession.clubId) {
      return;
    }

    // Verify question belongs to this club
    const question = await prisma.question.findUnique({
      where: { id: questionId }
    });

    if (!question || question.createdByClubId !== currentSession.clubId) {
      return;
    }

    // Delete options first (due to FK constraint)
    await prisma.questionOption.deleteMany({
      where: { questionId },
    });

    // Delete question
    await prisma.question.delete({
      where: { id: questionId },
    });

    revalidatePath("/club/questions");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">Klubbens spørgsmål</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Opret dine egne spørgsmål, som kan tilføjes til spørgeskemaer. Du kan ikke redigere eller slette spørgsmål, der er sendt ud.
        </p>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Opret nyt eget spørgsmål</h3>
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

          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium" htmlFor="optionsRaw">
              Svarmuligheder (kommasepareret, kun for valgmuligheder)
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

      {customQuestions.length > 0 && (
        <section className="rounded-xl border bg-background p-6">
          <h3 className="text-lg font-semibold">Dine egne spørgsmål</h3>
          <div className="mt-4 space-y-3">
            {customQuestions.map((question) => (
              <ClubQuestionEditCard
                key={question.id}
                question={question}
                isLocked={sentSurveyIds.has(question.id)}
                onEdit={editQuestionAction}
                onDelete={deleteQuestionAction}
              />
            ))}
          </div>
        </section>
      )}

      {dmuQuestions.length > 0 && (
        <section className="rounded-xl border bg-background p-6">
          <h3 className="text-lg font-semibold">DMU standardspørgsmål (til brug i spørgeskemaer)</h3>
          <p className="mt-2 text-xs text-muted-foreground">
            Disse spørgsmål kan tilføjes når du laver et nyt spørgeskema.
          </p>
          <div className="mt-4 space-y-2">
            {dmuQuestions.map((question) => (
              <div key={question.id} className="rounded-lg border p-3">
                <p className="font-medium text-sm">{question.title}</p>
                {question.options.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Svarmuligheder: {question.options.map((opt) => opt.label).join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
