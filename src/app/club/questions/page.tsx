import { QuestionType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ClubQuestionCreateForm } from "./club-question-create-form";
import { ClubQuestionEditCard } from "./club-question-edit-card";

const questionTypeLabels: Record<QuestionType, string> = {
  SCALE_1_5: "Skala 1-5",
  SINGLE_CHOICE: "Valgmuligheder",
  TEXT: "Tekst",
};

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
      <section className="rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)] [&_p.text-muted-foreground]:text-white/75">
        <h2 className="text-3xl font-semibold tracking-tight text-white">Klubbens spørgsmål</h2>
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

  // Get active DMU templates with their active standard questions
  const dmuTemplates = await prisma.surveyTemplate.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      surveyType: true,
      templateQuestions: {
        where: {
          question: {
            scope: "DMU_STANDARD",
            active: true,
          },
        },
        orderBy: { sortOrder: "asc" },
        select: {
          required: true,
          question: {
            select: {
              id: true,
              title: true,
              questionType: true,
              options: {
                orderBy: { sortOrder: "asc" },
                select: { label: true },
              },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const surveyTypeLabels = {
    ANNUAL: "Årlig",
    EVENT: "Arrangement",
  } as const;

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
      <section className="rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)] [&_p.text-muted-foreground]:text-white/75">
        <h2 className="text-3xl font-semibold tracking-tight text-white">Klubbens spørgsmål</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Opret dine egne spørgsmål, som kan tilføjes til spørgeskemaer. Du kan ikke redigere eller slette spørgsmål, der er sendt ud.
        </p>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Opret nyt eget spørgsmål</h3>
        <ClubQuestionCreateForm action={createQuestionAction} />
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

      {dmuTemplates.length > 0 && (
        <section className="rounded-xl border bg-background p-6">
          <h3 className="text-lg font-semibold">DMU standardspørgsmål (til brug i spørgeskemaer)</h3>
          <p className="mt-2 text-xs text-muted-foreground">
            Udvid en skabelon for at se de tilhørende spørgsmål.
          </p>
          <div className="mt-4 space-y-2">
            {dmuTemplates.map((template) => (
              <details key={template.id} className="rounded-lg border" open={dmuTemplates.length === 1}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{template.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {surveyTypeLabels[template.surveyType]} · {template.templateQuestions.length} spørgsmål
                    </p>
                  </div>
                  <span className="rounded-md border px-2 py-1 text-[11px] font-medium">Vis spørgsmål</span>
                </summary>

                <div className="space-y-2 border-t p-3">
                  {template.templateQuestions.map((templateQuestion) => (
                    <div key={`${template.id}-${templateQuestion.question.id}`} className="rounded-md border p-3">
                      <p className="text-sm font-medium">{templateQuestion.question.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Type: {questionTypeLabels[templateQuestion.question.questionType]}
                        {templateQuestion.required ? " · Påkrævet" : " · Valgfri"}
                      </p>
                      {templateQuestion.question.options.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Svarmuligheder: {templateQuestion.question.options.map((option) => option.label).join(", ")}
                        </p>
                      )}
                    </div>
                  ))}
                  {template.templateQuestions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ingen aktive standardspørgsmål i denne skabelon.</p>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
