import { redirect } from "next/navigation";
import { DmuLogo } from "@/components/dmu-logo";
import { prisma } from "@/lib/prisma";
import { hashSurveyToken } from "@/lib/survey-token";

type LayoutItem =
  | {
      id: string;
      kind: "HEADING";
      title: string;
    }
  | {
      id: string;
      kind: "QUESTION";
      questionId: string;
    };

function parseLayoutItems(rawLayoutJson: unknown): LayoutItem[] {
  if (!rawLayoutJson || typeof rawLayoutJson !== "object") {
    return [];
  }

  const value = rawLayoutJson as { items?: unknown };
  if (!Array.isArray(value.items)) {
    return [];
  }

  const items: LayoutItem[] = [];
  for (const candidate of value.items) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const record = candidate as Record<string, unknown>;
    if (record.kind === "HEADING" && typeof record.id === "string" && typeof record.title === "string" && record.title.trim()) {
      items.push({ id: record.id, kind: "HEADING", title: record.title.trim() });
      continue;
    }

    if (record.kind === "QUESTION" && typeof record.id === "string" && typeof record.questionId === "string") {
      items.push({ id: record.id, kind: "QUESTION", questionId: record.questionId });
    }
  }

  return items;
}

const fallbackRespondentProfile = {
  ageGroup: "AGE_31_50" as const,
  raceClass: "MOTOCROSS" as const,
  memberRole: "VOLUNTEER" as const,
};

export default async function SurveyTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tokenHash = hashSurveyToken(token);

  const invitation = await prisma.surveyInvitation.findFirst({
    where: { OR: [{ token: tokenHash }, { token }] },
    include: {
      member: true,
      surveyInstance: {
        include: {
          surveyTemplate: {
            select: {
              layoutJson: true,
            },
          },
          surveyInstanceQuestions: {
            include: {
              question: {
                include: {
                  options: { orderBy: { sortOrder: "asc" } },
                },
              },
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });

  if (!invitation) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-10">
        <section className="w-full rounded-xl border bg-background p-6">
          <DmuLogo compact />
          <h1 className="text-2xl font-semibold">Linket er ugyldigt</h1>
          <p className="mt-2 text-sm text-muted-foreground">Spørgeskema-linket findes ikke eller er udløbet.</p>
        </section>
      </div>
    );
  }

  if (invitation.status === "ANSWERED") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-10">
        <section className="w-full rounded-xl border bg-background p-6">
          <DmuLogo compact />
          <h1 className="text-2xl font-semibold">Du har allerede svaret</h1>
          <p className="mt-2 text-sm text-muted-foreground">Dette link kan kun bruges én gang.</p>
        </section>
      </div>
    );
  }

  const surveyIsClosed =
    invitation.surveyInstance.status !== "SENT" ||
    Boolean(invitation.surveyInstance.closesAt && invitation.surveyInstance.closesAt <= new Date());

  if (surveyIsClosed) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-10">
        <section className="w-full rounded-xl border bg-background p-6">
          <DmuLogo compact />
          <h1 className="text-2xl font-semibold">Spørgeskemaet er lukket</h1>
          <p className="mt-2 text-sm text-muted-foreground">Tak for din interesse. Der modtages ikke længere svar.</p>
        </section>
      </div>
    );
  }

  if (!invitation.openedAt) {
    await prisma.surveyInvitation.update({
      where: { id: invitation.id },
      data: {
        status: invitation.status === "SENT" ? "OPENED" : invitation.status,
        openedAt: new Date(),
      },
    });
  }

  async function submitSurveyAction(formData: FormData) {
    "use server";

    const currentInvitation = await prisma.surveyInvitation.findFirst({
      where: { OR: [{ token: tokenHash }, { token }] },
      include: {
        member: true,
        surveyInstance: {
          include: {
            surveyInstanceQuestions: {
              include: {
                question: {
                  include: {
                    options: true,
                  },
                },
              },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
    });

    const surveyHasClosed =
      !currentInvitation ||
      currentInvitation.status === "ANSWERED" ||
      currentInvitation.surveyInstance.status !== "SENT" ||
      Boolean(currentInvitation.surveyInstance.closesAt && currentInvitation.surveyInstance.closesAt <= new Date());

    if (surveyHasClosed || !currentInvitation) {
      return;
    }

    const answersToCreate: { questionId: string; numericValue?: number; optionValue?: string; textValue?: string }[] = [];

    for (const surveyQuestion of currentInvitation.surveyInstance.surveyInstanceQuestions) {
      const fieldName = `question_${surveyQuestion.questionId}`;
      const rawValue = String(formData.get(fieldName) ?? "").trim();

      if (surveyQuestion.required && !rawValue) {
        return;
      }

      if (!rawValue) {
        continue;
      }

      if (surveyQuestion.question.questionType === "SCALE_1_5") {
        const numericValue = Number(rawValue);
        if (!Number.isInteger(numericValue) || numericValue < 1 || numericValue > 5) {
          return;
        }
        answersToCreate.push({ questionId: surveyQuestion.questionId, numericValue });
        continue;
      }

      if (surveyQuestion.question.questionType === "SINGLE_CHOICE") {
        const validOptionValues = new Set(surveyQuestion.question.options.map((option) => option.value));
        if (!validOptionValues.has(rawValue)) {
          return;
        }
        answersToCreate.push({ questionId: surveyQuestion.questionId, optionValue: rawValue });
        continue;
      }

      answersToCreate.push({ questionId: surveyQuestion.questionId, textValue: rawValue });
    }

    if (answersToCreate.length === 0) {
      return;
    }

    const submitted = await prisma.$transaction(async (transaction) => {
      const submittedAt = new Date();
      const claim = await transaction.surveyInvitation.updateMany({
        where: {
          id: currentInvitation.id,
          status: { in: ["SENT", "OPENED"] },
        },
        data: {
          status: "ANSWERED",
          answeredAt: submittedAt,
          openedAt: currentInvitation.openedAt ?? submittedAt,
        },
      });

      // Only the first request is allowed to claim this one-time link.
      if (claim.count !== 1) {
        return false;
      }

      const response = await transaction.surveyResponse.create({
        data: {
          surveyInstanceId: currentInvitation.surveyInstanceId,
          clubId: currentInvitation.surveyInstance.clubId,
          ageGroup: currentInvitation.member?.ageGroup ?? fallbackRespondentProfile.ageGroup,
          raceClass: currentInvitation.member?.raceClass ?? fallbackRespondentProfile.raceClass,
          memberRole: currentInvitation.member?.memberRole ?? fallbackRespondentProfile.memberRole,
          submittedAt,
        },
      });

      for (const answer of answersToCreate) {
        await transaction.surveyAnswer.create({
          data: {
            surveyResponseId: response.id,
            questionId: answer.questionId,
            numericValue: answer.numericValue ?? null,
            optionValue: answer.optionValue ?? null,
            textValue: answer.textValue ?? null,
          },
        });
      }

      return true;
    });

    if (!submitted) {
      return;
    }

    redirect("/thank-you");
  }

  const layoutItems = parseLayoutItems(invitation.surveyInstance.surveyTemplate.layoutJson);
  const questionById = new Map(
    invitation.surveyInstance.surveyInstanceQuestions.map((surveyQuestion) => [surveyQuestion.questionId, surveyQuestion]),
  );

  const usedQuestionIds = new Set<string>();
  const renderedItems: Array<
    | { kind: "HEADING"; id: string; title: string }
    | {
        kind: "QUESTION";
        id: string;
        surveyQuestion: (typeof invitation.surveyInstance.surveyInstanceQuestions)[number];
      }
  > = [];

  for (const item of layoutItems) {
    if (item.kind === "HEADING") {
      renderedItems.push({ kind: "HEADING", id: item.id, title: item.title });
      continue;
    }

    const surveyQuestion = questionById.get(item.questionId);
    if (!surveyQuestion) {
      continue;
    }

    renderedItems.push({ kind: "QUESTION", id: item.id, surveyQuestion });
    usedQuestionIds.add(item.questionId);
  }

  for (const surveyQuestion of invitation.surveyInstance.surveyInstanceQuestions) {
    if (usedQuestionIds.has(surveyQuestion.questionId)) {
      continue;
    }

    renderedItems.push({
      kind: "QUESTION",
      id: `fallback-${surveyQuestion.id}`,
      surveyQuestion,
    });
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-10">
      <section className="w-full rounded-xl border bg-background p-6">
        <DmuLogo compact />
        <h1 className="text-2xl font-semibold">Medlemsspørgeskema</h1>
        <p className="mt-2 text-sm text-muted-foreground">Svar anonymt. Det tager ca. 2-3 minutter.</p>

        <form action={submitSurveyAction} className="mt-6 space-y-5">
          {(() => {
            let questionNumber = 0;

            return renderedItems.map((item) => {
              if (item.kind === "HEADING") {
                return (
                  <div key={item.id} className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Afsnit</p>
                    <h2 className="mt-1 text-lg font-semibold text-blue-950">{item.title}</h2>
                  </div>
                );
              }

              questionNumber += 1;
              const surveyQuestion = item.surveyQuestion;
            const fieldName = `question_${surveyQuestion.questionId}`;
            return (
              <div key={item.id} className="rounded-lg border p-4">
                <label className="block text-sm font-medium" htmlFor={fieldName}>
                  {questionNumber}. {surveyQuestion.question.title}
                  {surveyQuestion.required ? " *" : ""}
                </label>

                {surveyQuestion.question.questionType === "SCALE_1_5" ? (
                  <select id={fieldName} name={fieldName} required={surveyQuestion.required} className="mt-2 w-full rounded-md border px-3 py-2 text-sm">
                    <option value="">Vælg</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                ) : null}

                {surveyQuestion.question.questionType === "SINGLE_CHOICE" ? (
                  <select id={fieldName} name={fieldName} required={surveyQuestion.required} className="mt-2 w-full rounded-md border px-3 py-2 text-sm">
                    <option value="">Vælg</option>
                    {surveyQuestion.question.options.map((option) => (
                      <option key={option.id} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : null}

                {surveyQuestion.question.questionType === "TEXT" ? (
                  <textarea
                    id={fieldName}
                    name={fieldName}
                    required={surveyQuestion.required}
                    className="mt-2 min-h-24 w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="Skriv dit svar her"
                  />
                ) : null}
              </div>
            );
            });
          })()}

          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Indsend svar
          </button>
        </form>
      </section>
    </div>
  );
}
