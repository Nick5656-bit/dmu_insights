import { redirect } from "next/navigation";
import { DmuLogo } from "@/components/dmu-logo";
import { prisma } from "@/lib/prisma";

export default async function SurveyTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const invitation = await prisma.surveyInvitation.findUnique({
    where: { token },
    include: {
      member: true,
      surveyInstance: {
        include: {
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

    const currentInvitation = await prisma.surveyInvitation.findUnique({
      where: { token },
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

    if (!currentInvitation || currentInvitation.status === "ANSWERED") {
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

    await prisma.$transaction(async (transaction) => {
      const response = await transaction.surveyResponse.create({
        data: {
          surveyInstanceId: currentInvitation.surveyInstanceId,
          clubId: currentInvitation.surveyInstance.clubId,
          ageGroup: currentInvitation.member.ageGroup,
          raceClass: currentInvitation.member.raceClass,
          memberRole: currentInvitation.member.memberRole,
          submittedAt: new Date(),
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

      await transaction.surveyInvitation.update({
        where: { id: currentInvitation.id },
        data: {
          status: "ANSWERED",
          answeredAt: new Date(),
          openedAt: currentInvitation.openedAt ?? new Date(),
        },
      });
    });

    redirect("/thank-you");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-10">
      <section className="w-full rounded-xl border bg-background p-6">
        <DmuLogo compact />
        <h1 className="text-2xl font-semibold">Medlemsspørgeskema</h1>
        <p className="mt-2 text-sm text-muted-foreground">Svar anonymt. Det tager ca. 2-3 minutter.</p>

        <form action={submitSurveyAction} className="mt-6 space-y-5">
          {invitation.surveyInstance.surveyInstanceQuestions.map((surveyQuestion, index) => {
            const fieldName = `question_${surveyQuestion.questionId}`;
            return (
              <div key={surveyQuestion.id} className="rounded-lg border p-4">
                <label className="block text-sm font-medium" htmlFor={fieldName}>
                  {index + 1}. {surveyQuestion.question.title}
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
          })}

          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Indsend svar
          </button>
        </form>
      </section>
    </div>
  );
}
