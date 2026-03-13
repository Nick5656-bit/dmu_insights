import { QuestionType } from "@prisma/client";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createCustomQuestionSchema = z.object({
  title: z.string().trim().min(3),
  description: z.string().trim().optional(),
  questionType: z.nativeEnum(QuestionType),
  optionsRaw: z.string().trim().optional(),
  required: z.boolean(),
});

const addExistingQuestionSchema = z.object({
  surveyInstanceId: z.string(),
  questionId: z.string(),
  required: z.boolean(),
});

const questionTypeLabels: Record<QuestionType, string> = {
  SCALE_1_5: "Skala 1-5",
  SINGLE_CHOICE: "Valgmuligheder",
  TEXT: "Tekst",
};

export default async function ClubSurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("CLUB_ADMIN");
  const { id } = await params;

  const surveyInstance = await prisma.surveyInstance.findUnique({
    where: { id },
    include: {
      surveyTemplate: true,
      invitations: true,
      responses: true,
      surveyInstanceQuestions: {
        include: {
          question: {
            include: { options: { orderBy: { sortOrder: "asc" } }, createdByClub: true },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!surveyInstance || surveyInstance.clubId !== session.clubId) {
    notFound();
  }

  // Get club's custom questions that aren't already in this survey
  const existingQuestionIds = new Set(
    surveyInstance.surveyInstanceQuestions.map((q) => q.questionId)
  );

  const availableCustomQuestions = await prisma.question.findMany({
    where: {
      scope: "CLUB_CUSTOM",
      createdByClubId: session.clubId,
      id: {
        notIn: Array.from(existingQuestionIds),
      },
    },
    include: { options: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  const coreQuestions = surveyInstance.surveyInstanceQuestions.filter((item) => item.sourceType === "CORE");
  const customQuestions = surveyInstance.surveyInstanceQuestions.filter((item) => item.sourceType === "CLUB_ADDED");

  async function sendSurveyNowAction(formData: FormData) {
    "use server";
    const currentSession = await requireRole("CLUB_ADMIN");
    const surveyInstanceId = String(formData.get("surveyInstanceId") ?? "");

    if (!currentSession.clubId || !surveyInstanceId) {
      return;
    }

    const currentSurvey = await prisma.surveyInstance.findUnique({
      where: { id: surveyInstanceId },
      include: {
        invitations: true,
      },
    });

    if (!currentSurvey || currentSurvey.clubId !== currentSession.clubId) {
      return;
    }

    const members = await prisma.member.findMany({
      where: {
        clubId: currentSession.clubId,
        active: true,
      },
      select: {
        id: true,
        email: true,
      },
    });

    const existingInvitationByMember = new Set(currentSurvey.invitations.map((invitation) => invitation.memberId));
    const now = new Date();

    for (const member of members) {
      if (existingInvitationByMember.has(member.id)) {
        continue;
      }

      const token = `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, "")}`;

      const invitation = await prisma.surveyInvitation.create({
        data: {
          surveyInstanceId: currentSurvey.id,
          memberId: member.id,
          emailSnapshot: member.email,
          token,
          status: "SENT",
          sentAt: now,
        },
      });

      await prisma.mailLog.create({
        data: {
          surveyInvitationId: invitation.id,
          toEmail: member.email,
          subject: `Survey fra din klub: ${currentSurvey.name}`,
          bodyPreview: `Besvar anonymt via link: /survey/${token}`,
          sentAt: now,
          status: "SENT",
        },
      });
    }

    await prisma.surveyInstance.update({
      where: { id: currentSurvey.id },
      data: {
        status: "SENT",
        sentAt: currentSurvey.sentAt ?? now,
      },
    });

    revalidatePath(`/club/surveys/${surveyInstanceId}`);
    revalidatePath("/club/surveys");
    revalidatePath("/club/outbox");
    revalidatePath("/dmu/outbox");
  }

  async function addCustomQuestionAction(formData: FormData) {
    "use server";
    const currentSession = await requireRole("CLUB_ADMIN");
    const surveyInstanceId = String(formData.get("surveyInstanceId") ?? "");

    if (!surveyInstanceId || !currentSession.clubId) {
      return;
    }

    const currentSurvey = await prisma.surveyInstance.findUnique({ where: { id: surveyInstanceId } });
    if (!currentSurvey || currentSurvey.clubId !== currentSession.clubId) {
      return;
    }

    const parsed = createCustomQuestionSchema.safeParse({
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      questionType: String(formData.get("questionType") ?? "") as QuestionType,
      optionsRaw: String(formData.get("optionsRaw") ?? ""),
      required: String(formData.get("required") ?? "") === "on",
    });

    if (!parsed.success) {
      return;
    }

    const options =
      parsed.data.questionType === "SINGLE_CHOICE"
        ? (parsed.data.optionsRaw ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];

    if (parsed.data.questionType === "SINGLE_CHOICE" && options.length < 2) {
      return;
    }

    const maxSortOrder = await prisma.surveyInstanceQuestion.aggregate({
      where: { surveyInstanceId },
      _max: { sortOrder: true },
    });

    const question = await prisma.question.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description || null,
        questionType: parsed.data.questionType,
        scope: "CLUB_CUSTOM",
        createdByClubId: currentSession.clubId,
        active: true,
      },
    });

    if (options.length > 0) {
      await prisma.questionOption.createMany({
        data: options.map((label, index) => ({
          questionId: question.id,
          label,
          value: label.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, ""),
          sortOrder: index + 1,
        })),
      });
    }

    await prisma.surveyInstanceQuestion.create({
      data: {
        surveyInstanceId,
        questionId: question.id,
        sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
        required: parsed.data.required,
        sourceType: "CLUB_ADDED",
      },
    });

    revalidatePath(`/club/surveys/${surveyInstanceId}`);
    revalidatePath("/club/surveys");
  }

  async function addExistingCustomQuestionAction(formData: FormData) {
    "use server";
    const currentSession = await requireRole("CLUB_ADMIN");

    const parsed = addExistingQuestionSchema.safeParse({
      surveyInstanceId: String(formData.get("surveyInstanceId") ?? ""),
      questionId: String(formData.get("questionId") ?? ""),
      required: String(formData.get("required") ?? "") === "on",
    });

    if (!parsed.success) {
      return;
    }

    const { surveyInstanceId, questionId, required } = parsed.data;

    if (!currentSession.clubId) {
      return;
    }

    // Verify the survey instance belongs to this club
    const surveyInstance = await prisma.surveyInstance.findUnique({
      where: { id: surveyInstanceId },
    });

    if (!surveyInstance || surveyInstance.clubId !== currentSession.clubId) {
      return;
    }

    // Verify the question belongs to this club
    const question = await prisma.question.findUnique({
      where: { id: questionId },
    });

    if (!question || question.createdByClubId !== currentSession.clubId) {
      return;
    }

    // Check if question is already in the survey
    const existing = await prisma.surveyInstanceQuestion.findUnique({
      where: {
        surveyInstanceId_questionId: {
          surveyInstanceId,
          questionId,
        },
      },
    });

    if (existing) {
      return; // Already added
    }

    const maxSortOrder = await prisma.surveyInstanceQuestion.aggregate({
      where: { surveyInstanceId },
      _max: { sortOrder: true },
    });

    await prisma.surveyInstanceQuestion.create({
      data: {
        surveyInstanceId,
        questionId,
        sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
        required,
        sourceType: "CLUB_ADDED",
      },
    });

    revalidatePath(`/club/surveys/${surveyInstanceId}`);
    revalidatePath("/club/surveys");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">{surveyInstance.name}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Skabelon: {surveyInstance.surveyTemplate.name} · Type: {surveyInstance.surveyType} · Status: {surveyInstance.status}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Invitationer: {surveyInstance.invitations.length} · Svar: {surveyInstance.responses.length}
        </p>
        <form action={sendSurveyNowAction} className="mt-4">
          <input type="hidden" name="surveyInstanceId" value={surveyInstance.id} />
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Send spørgeskema nu (testmail)
          </button>
        </form>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Kerne-spørgsmål fra DMU-template</h3>
        <ul className="mt-4 space-y-2 text-sm">
          {coreQuestions.map((item) => (
            <li key={item.id} className="rounded-md border p-3">
              <p className="font-medium">{item.question.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {questionTypeLabels[item.question.questionType]} · {item.required ? "Obligatorisk" : "Valgfri"}
              </p>
            </li>
          ))}
          {coreQuestions.length === 0 ? <li className="text-sm text-muted-foreground">Ingen kerne-spørgsmål endnu.</li> : null}
        </ul>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Tilføj klubspecifikt spørgsmål</h3>
        
        {availableCustomQuestions.length > 0 && (
          <div className="mt-4 mb-6 rounded-lg bg-muted/30 p-4 border">
            <p className="mb-3 text-sm font-medium">Vælg fra dine eksisterende spørgsmål:</p>
            <div className="space-y-2">
              {availableCustomQuestions.map((question) => (
                <form key={question.id} action={addExistingCustomQuestionAction} className="flex items-center gap-3 p-2 rounded border hover:bg-muted/50">
                  <input type="hidden" name="surveyInstanceId" value={surveyInstance.id} />
                  <input type="hidden" name="questionId" value={question.id} />
                  <label className="flex items-center gap-2 flex-1 cursor-pointer">
                    <input type="checkbox" name="required" className="w-4 h-4" />
                    <span className="text-sm">{question.title}</span>
                  </label>
                  <button type="submit" className="rounded-md bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20">
                    Tilføj
                  </button>
                </form>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Markér "Obligatorisk" hvis spørgsmålet skal være obligatorisk i denne måling.</p>
          </div>
        )}

        <form action={addCustomQuestionAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <input type="hidden" name="surveyInstanceId" value={surveyInstance.id} />

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
            <select id="questionType" name="questionType" defaultValue="TEXT" className="w-full rounded-md border px-3 py-2 text-sm">
              <option value="TEXT">Tekst</option>
              <option value="SCALE_1_5">Skala 1-5</option>
              <option value="SINGLE_CHOICE">Valgmuligheder</option>
            </select>
          </div>

          <label className="mt-7 flex items-center gap-2 text-sm">
            <input type="checkbox" name="required" />
            Obligatorisk spørgsmål
          </label>

          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium" htmlFor="optionsRaw">
              Svarmuligheder (kommasepareret)
            </label>
            <input id="optionsRaw" name="optionsRaw" className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Ja, Måske, Nej" />
          </div>

          <div className="md:col-span-2">
            <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Opret og tilføj nyt spørgsmål
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Klubspecifikke spørgsmål</h3>
        <ul className="mt-4 space-y-2 text-sm">
          {customQuestions.map((item) => (
            <li key={item.id} className="rounded-md border p-3">
              <p className="font-medium">{item.question.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {questionTypeLabels[item.question.questionType]} · {item.required ? "Obligatorisk" : "Valgfri"}
              </p>
            </li>
          ))}
          {customQuestions.length === 0 ? <li className="text-sm text-muted-foreground">Ingen klubspørgsmål endnu.</li> : null}
        </ul>
      </section>
    </div>
  );
}
