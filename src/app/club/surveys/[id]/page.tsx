import { QuestionType } from "@prisma/client";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createSurveyToken, hashSurveyToken } from "@/lib/survey-token";
import { SubmitButton } from "@/components/submit-button";

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

const scheduleSurveySendSchema = z.object({
  surveyInstanceId: z.string(),
  sendAt: z.string().min(1),
});

const questionTypeLabels: Record<QuestionType, string> = {
  SCALE_1_5: "Skala 1-5",
  SINGLE_CHOICE: "Valgmuligheder",
  TEXT: "Tekst",
};

const surveyStatusLabels = {
  DRAFT: "Kladde",
  SCHEDULED: "Planlagt",
  SENT: "Sendt",
  CLOSED: "Lukket",
} as const;

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatDateOnly(value: Date) {
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

export default async function ClubSurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("CLUB_ADMIN");
  const { id } = await params;

  const surveyInstance = await prisma.surveyInstance.findUnique({
    where: { id },
    include: {
      surveyTemplate: true,
      event: true,
      invitations: true,
      responses: true,
      scheduledSends: {
        orderBy: { sendAt: "asc" },
      },
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
  const nextScheduledSend = surveyInstance.scheduledSends.find((scheduledSend) => scheduledSend.status === "PENDING") ?? surveyInstance.scheduledSends[0] ?? null;
  const now = new Date();
  const isSentOrClosed = surveyInstance.status === "SENT" || surveyInstance.status === "CLOSED";
  const deadlinePassed = nextScheduledSend ? nextScheduledSend.sendAt.getTime() <= now.getTime() : false;
  const isEventSurvey = surveyInstance.surveyType === "EVENT";
  const canEditSurvey = !isSentOrClosed && !deadlinePassed;
  const isClubReady = Boolean(surveyInstance.clubReadyAt);
  const surveyTypeLabel = isEventSurvey ? "Event" : "Årlig";
  const nextSendLabel = nextScheduledSend ? formatDateTime(nextScheduledSend.sendAt) : "Ikke planlagt";
  const readyStatusLabel = isClubReady ? "Klar" : "Afventer";
  const editingStatusText = isSentOrClosed
    ? "Låst: spørgeskemaet er sendt eller lukket."
    : nextScheduledSend
      ? `Kan redigeres indtil ${formatDateTime(nextScheduledSend.sendAt)}.`
      : "Kan redigeres.";

  async function updateReadyStateAction(formData: FormData) {
    "use server";
    const currentSession = await requireRole("CLUB_ADMIN");
    const surveyInstanceId = String(formData.get("surveyInstanceId") ?? "");
    const intent = String(formData.get("intent") ?? "");

    if (!currentSession.clubId || !surveyInstanceId) {
      return;
    }

    const currentSurvey = await prisma.surveyInstance.findUnique({
      where: { id: surveyInstanceId },
      include: {
        scheduledSends: {
          where: { status: "PENDING" },
          orderBy: { sendAt: "asc" },
          take: 1,
        },
      },
    });

    if (!currentSurvey || currentSurvey.clubId !== currentSession.clubId || currentSurvey.surveyType !== "EVENT") {
      return;
    }

    const sendDeadline = currentSurvey.scheduledSends[0]?.sendAt;
    if (
      currentSurvey.status === "SENT" ||
      currentSurvey.status === "CLOSED" ||
      (sendDeadline && sendDeadline.getTime() <= Date.now())
    ) {
      return;
    }

    await prisma.surveyInstance.update({
      where: { id: currentSurvey.id },
      data:
        intent === "ready"
          ? {
              clubReadyAt: new Date(),
              clubReadyByUserId: currentSession.userId,
            }
          : {
              clubReadyAt: null,
              clubReadyByUserId: null,
            },
    });

    revalidatePath(`/club/surveys/${surveyInstanceId}`);
    revalidatePath("/club/events");
    revalidatePath("/dmu/events");
  }

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
        scheduledSends: {
          where: { status: "PENDING" },
          orderBy: { sendAt: "asc" },
          take: 1,
        },
      },
    });

    if (!currentSurvey || currentSurvey.clubId !== currentSession.clubId) {
      return;
    }

    const sendDeadline = currentSurvey.scheduledSends[0]?.sendAt;
    if (
      currentSurvey.status === "SENT" ||
      currentSurvey.status === "CLOSED" ||
      currentSurvey.surveyType === "EVENT" ||
      (sendDeadline && sendDeadline.getTime() <= Date.now())
    ) {
      return;
    }

    const [members, extraEmails] = await Promise.all([
      prisma.member.findMany({
        where: {
          clubId: currentSession.clubId,
          active: true,
        },
        select: {
          id: true,
          email: true,
        },
      }),
      prisma.clubExtraEmail.findMany({
        where: {
          clubId: currentSession.clubId,
          active: true,
        },
        select: {
          email: true,
        },
      }),
    ]);

    const existingInvitationByMember = new Set(
      currentSurvey.invitations.map((invitation) => invitation.memberId).filter((id): id is string => Boolean(id))
    );
    const existingInvitationEmails = new Set(
      currentSurvey.invitations.map((invitation) => invitation.emailSnapshot.trim().toLowerCase())
    );
    const now = new Date();

    for (const member of members) {
      if (existingInvitationByMember.has(member.id)) {
        continue;
      }

      const normalizedEmail = member.email.trim().toLowerCase();
      if (existingInvitationEmails.has(normalizedEmail)) {
        continue;
      }

      const token = createSurveyToken();

      const invitation = await prisma.surveyInvitation.create({
        data: {
          surveyInstanceId: currentSurvey.id,
          memberId: member.id,
          emailSnapshot: member.email,
          token: hashSurveyToken(token),
          status: "SENT",
          sentAt: now,
        },
      });

      await prisma.mailLog.create({
        data: {
          surveyInvitationId: invitation.id,
          toEmail: normalizedEmail,
          subject: `Survey fra din klub: ${currentSurvey.name}`,
          bodyPreview: "Personligt besvarelseslink sendt. Linket gemmes ikke i mailhistorikken.",
          sentAt: now,
          status: "SENT",
        },
      });

      existingInvitationByMember.add(member.id);
      existingInvitationEmails.add(normalizedEmail);
    }

    for (const extraEmail of extraEmails) {
      const normalizedEmail = extraEmail.email.trim().toLowerCase();
      if (existingInvitationEmails.has(normalizedEmail)) {
        continue;
      }

      const token = createSurveyToken();

      const invitation = await prisma.surveyInvitation.create({
        data: {
          surveyInstanceId: currentSurvey.id,
          memberId: null,
          emailSnapshot: normalizedEmail,
          token: hashSurveyToken(token),
          status: "SENT",
          sentAt: now,
        },
      });

      await prisma.mailLog.create({
        data: {
          surveyInvitationId: invitation.id,
          toEmail: normalizedEmail,
          subject: `Survey fra din klub: ${currentSurvey.name}`,
          bodyPreview: "Personligt besvarelseslink sendt. Linket gemmes ikke i mailhistorikken.",
          sentAt: now,
          status: "SENT",
        },
      });

      existingInvitationEmails.add(normalizedEmail);
    }

    await prisma.scheduledSend.updateMany({
      where: {
        surveyInstanceId: currentSurvey.id,
        status: "PENDING",
      },
      data: {
        status: "PROCESSED",
        processedAt: now,
      },
    });

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

  async function scheduleSurveySendAction(formData: FormData) {
    "use server";
    const currentSession = await requireRole("CLUB_ADMIN");

    const parsed = scheduleSurveySendSchema.safeParse({
      surveyInstanceId: String(formData.get("surveyInstanceId") ?? ""),
      sendAt: String(formData.get("sendAt") ?? ""),
    });

    if (!parsed.success || !currentSession.clubId) {
      return;
    }

    const sendAt = new Date(parsed.data.sendAt);
    if (Number.isNaN(sendAt.getTime()) || sendAt.getTime() <= Date.now()) {
      return;
    }

    const currentSurvey = await prisma.surveyInstance.findUnique({
      where: { id: parsed.data.surveyInstanceId },
      include: {
        scheduledSends: {
          where: { status: "PENDING" },
          orderBy: { sendAt: "asc" },
          take: 1,
        },
      },
    });

    if (!currentSurvey || currentSurvey.clubId !== currentSession.clubId || currentSurvey.surveyType === "EVENT") {
      return;
    }

    if (currentSurvey.status === "SENT" || currentSurvey.status === "CLOSED") {
      return;
    }

    const existingPending = currentSurvey.scheduledSends[0];
    if (existingPending) {
      await prisma.scheduledSend.update({
        where: { id: existingPending.id },
        data: {
          sendAt,
          triggerType: "MANUAL",
        },
      });
    } else {
      await prisma.scheduledSend.create({
        data: {
          surveyInstanceId: currentSurvey.id,
          sendAt,
          status: "PENDING",
          triggerType: "MANUAL",
        },
      });
    }

    await prisma.surveyInstance.update({
      where: { id: currentSurvey.id },
      data: {
        status: "SCHEDULED",
      },
    });

    revalidatePath(`/club/surveys/${currentSurvey.id}`);
    revalidatePath("/club/surveys");
    revalidatePath("/club/events");
    revalidatePath("/dmu/outbox");
  }

  async function addCustomQuestionAction(formData: FormData) {
    "use server";
    const currentSession = await requireRole("CLUB_ADMIN");
    const surveyInstanceId = String(formData.get("surveyInstanceId") ?? "");

    if (!surveyInstanceId || !currentSession.clubId) {
      return;
    }

    const currentSurvey = await prisma.surveyInstance.findUnique({
      where: { id: surveyInstanceId },
      include: {
        scheduledSends: {
          where: { status: "PENDING" },
          orderBy: { sendAt: "asc" },
          take: 1,
        },
      },
    });
    if (!currentSurvey || currentSurvey.clubId !== currentSession.clubId) {
      return;
    }

    const sendDeadline = currentSurvey.scheduledSends[0]?.sendAt;
    if (
      currentSurvey.status === "SENT" ||
      currentSurvey.status === "CLOSED" ||
      (sendDeadline && sendDeadline.getTime() <= Date.now())
    ) {
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

    await prisma.surveyInstance.update({
      where: { id: surveyInstanceId },
      data: {
        clubReadyAt: null,
        clubReadyByUserId: null,
      },
    });

    revalidatePath(`/club/surveys/${surveyInstanceId}`);
    revalidatePath("/club/surveys");
    revalidatePath("/club/events");
    revalidatePath("/dmu/events");
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
      include: {
        scheduledSends: {
          where: { status: "PENDING" },
          orderBy: { sendAt: "asc" },
          take: 1,
        },
      },
    });

    if (!surveyInstance || surveyInstance.clubId !== currentSession.clubId) {
      return;
    }

    const sendDeadline = surveyInstance.scheduledSends[0]?.sendAt;
    if (
      surveyInstance.status === "SENT" ||
      surveyInstance.status === "CLOSED" ||
      (sendDeadline && sendDeadline.getTime() <= Date.now())
    ) {
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

    await prisma.surveyInstance.update({
      where: { id: surveyInstanceId },
      data: {
        clubReadyAt: null,
        clubReadyByUserId: null,
      },
    });

    revalidatePath(`/club/surveys/${surveyInstanceId}`);
    revalidatePath("/club/surveys");
    revalidatePath("/club/events");
    revalidatePath("/dmu/events");
  }

  async function removeCustomQuestionAction(formData: FormData) {
    "use server";
    const currentSession = await requireRole("CLUB_ADMIN");

    const surveyInstanceQuestionId = String(formData.get("surveyInstanceQuestionId") ?? "");
    if (!surveyInstanceQuestionId || !currentSession.clubId) {
      return;
    }

    const surveyQuestion = await prisma.surveyInstanceQuestion.findUnique({
      where: { id: surveyInstanceQuestionId },
      include: {
        surveyInstance: {
          include: {
            scheduledSends: {
              where: { status: "PENDING" },
              orderBy: { sendAt: "asc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!surveyQuestion) {
      return;
    }

    if (surveyQuestion.sourceType !== "CLUB_ADDED") {
      return;
    }

    const survey = surveyQuestion.surveyInstance;
    if (!survey || survey.clubId !== currentSession.clubId) {
      return;
    }

    const sendDeadline = survey.scheduledSends[0]?.sendAt;
    if (
      survey.status === "SENT" ||
      survey.status === "CLOSED" ||
      (sendDeadline && sendDeadline.getTime() <= Date.now())
    ) {
      return;
    }

    await prisma.surveyInstanceQuestion.delete({
      where: { id: surveyInstanceQuestionId },
    });

    await prisma.surveyInstance.update({
      where: { id: survey.id },
      data: {
        clubReadyAt: null,
        clubReadyByUserId: null,
      },
    });

    revalidatePath(`/club/surveys/${survey.id}`);
    revalidatePath("/club/surveys");
    revalidatePath("/club/events");
    revalidatePath("/dmu/events");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-background p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-primary/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                {surveyInstance.surveyTemplate.name}
              </span>
              <span className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {surveyTypeLabel}
              </span>
              <span className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {surveyStatusLabels[surveyInstance.status]}
              </span>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-balance">{surveyInstance.name}</h2>
              <p className="text-sm text-muted-foreground">
                {isEventSurvey
                  ? `${surveyInstance.event?.title ?? "Event"} · ${surveyInstance.event ? formatDateOnly(surveyInstance.event.eventDate) : "-"}`
                  : `Næste udsendelse · ${nextSendLabel}`}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[320px]">
            <article className="rounded-2xl border bg-muted/20 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Invitationer</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{surveyInstance.invitations.length}</p>
            </article>
            <article className="rounded-2xl border bg-muted/20 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Svar</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{surveyInstance.responses.length}</p>
            </article>
          </div>
        </div>

        {isEventSurvey ? (
          <div className="mt-6 rounded-2xl border bg-muted/20 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <article className="rounded-2xl border bg-background p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Arrangement</p>
                <p className="mt-2 text-sm font-medium">{surveyInstance.event?.title ?? "-"}</p>
              </article>
              <article className="rounded-2xl border bg-background p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Eventdato</p>
                <p className="mt-2 text-sm font-medium">{surveyInstance.event ? formatDateOnly(surveyInstance.event.eventDate) : "-"}</p>
              </article>
              <article className="rounded-2xl border bg-background p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Udsendelse</p>
                <p className="mt-2 text-sm font-medium">{nextSendLabel}</p>
              </article>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  isClubReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                }`}
              >
                {readyStatusLabel}
              </span>
              {canEditSurvey ? (
                <form action={updateReadyStateAction}>
                  <input type="hidden" name="surveyInstanceId" value={surveyInstance.id} />
                  <input type="hidden" name="intent" value={isClubReady ? "unready" : "ready"} />
                  <SubmitButton pendingText={isClubReady ? "Fjerner..." : "Gemmer..."} className="rounded-full border px-4 py-2 text-sm font-medium hover:bg-muted">
                    {isClubReady ? "Fjern klar" : "Marker klar"}
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          </div>
        ) : null}

        {!isEventSurvey ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
            <form action={sendSurveyNowAction}>
              <input type="hidden" name="surveyInstanceId" value={surveyInstance.id} />
              <SubmitButton
                pendingText="Sender..."
                disabled={!canEditSurvey}
                className="w-full rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send spørgeskema nu (testmail)
              </SubmitButton>
            </form>

            <form action={scheduleSurveySendAction} className="flex flex-wrap items-end gap-3 rounded-2xl border bg-muted/20 p-4">
              <input type="hidden" name="surveyInstanceId" value={surveyInstance.id} />
              <div className="space-y-1">
                <label htmlFor="sendAt" className="text-xs font-medium text-muted-foreground">Planlæg udsendelse</label>
                <input
                  id="sendAt"
                  name="sendAt"
                  type="datetime-local"
                  required
                  className="rounded-xl border bg-background px-3 py-2 text-sm"
                  defaultValue={nextScheduledSend ? new Date(nextScheduledSend.sendAt.getTime() - new Date(nextScheduledSend.sendAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : undefined}
                />
              </div>
              <SubmitButton
                pendingText="Gemmer..."
                disabled={!canEditSurvey}
                className="rounded-full border px-4 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                Gem
              </SubmitButton>
            </form>

            <p className="hidden">
              Planlagte udsendelser behandles af DMU i udsendelsesmodulet, når tidspunktet er nået.
            </p>
          </div>
        ) : null}
      </section>

      <section className={`rounded-2xl border p-5 ${canEditSurvey ? "bg-background" : "border-amber-300 bg-amber-50"}`}>
        <h3 className="text-base font-semibold">Status</h3>
        <p className="mt-2 text-sm text-muted-foreground">{editingStatusText}</p>
        {isEventSurvey ? <p className="mt-1 text-xs text-muted-foreground">Ændringer fjerner klarmarkering.</p> : null}
      </section>

      <section className="rounded-2xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Kerne-spørgsmål fra DMU-template</h3>
        <ul className="mt-4 space-y-2 text-sm">
          {coreQuestions.map((item) => (
            <li key={item.id} className="rounded-xl border p-3">
              <p className="font-medium">{item.question.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {questionTypeLabels[item.question.questionType]} · {item.required ? "Obligatorisk" : "Valgfri"}
              </p>
            </li>
          ))}
          {coreQuestions.length === 0 ? <li className="text-sm text-muted-foreground">Ingen kerne-spørgsmål endnu.</li> : null}
        </ul>
      </section>

      <section className={`rounded-2xl border p-6 ${canEditSurvey ? "bg-background" : "bg-muted/20"}`}>
        <h3 className="text-lg font-semibold">{isEventSurvey ? "Klubbens spørgsmål" : "Tilføj klubspecifikt spørgsmål"}</h3>
        {!canEditSurvey ? (
          <p className="mt-2 text-sm text-muted-foreground">Redigering er låst for denne survey-instans.</p>
        ) : null}
        
        {canEditSurvey && availableCustomQuestions.length > 0 && (
          <div className="mt-4 mb-6 rounded-2xl border bg-muted/30 p-4">
            <p className="mb-3 text-sm font-medium">Genbrug eksisterende spørgsmål</p>
            <div className="space-y-2">
              {availableCustomQuestions.map((question) => (
                <form key={question.id} action={addExistingCustomQuestionAction} className="flex items-center gap-3 rounded-xl border p-2 hover:bg-muted/50">
                  <input type="hidden" name="surveyInstanceId" value={surveyInstance.id} />
                  <input type="hidden" name="questionId" value={question.id} />
                  <label className="flex items-center gap-2 flex-1 cursor-pointer">
                    <input type="checkbox" name="required" className="w-4 h-4" />
                    <span className="text-sm">{question.title}</span>
                  </label>
                  <SubmitButton pendingText="Tilføjer..." className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20">
                    Tilføj
                  </SubmitButton>
                </form>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Markér som obligatorisk ved behov.</p>
          </div>
        )}

        {canEditSurvey ? (
          <form action={addCustomQuestionAction} className="mt-4 grid gap-4 md:grid-cols-2">
            <input type="hidden" name="surveyInstanceId" value={surveyInstance.id} />

            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium" htmlFor="title">
                Spørgsmålstekst
              </label>
              <input id="title" name="title" required className="w-full rounded-xl border px-3 py-2 text-sm" />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium" htmlFor="description">
                Beskrivelse (valgfri)
              </label>
              <input id="description" name="description" className="w-full rounded-xl border px-3 py-2 text-sm" />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="questionType">
                Type
              </label>
              <select id="questionType" name="questionType" defaultValue="TEXT" className="w-full rounded-xl border px-3 py-2 text-sm">
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
              <SubmitButton pendingText="Opretter..." className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                Opret og tilføj nyt spørgsmål
              </SubmitButton>
            </div>
          </form>
        ) : null}
      </section>

      <section className="rounded-2xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Klubspecifikke spørgsmål</h3>
        <ul className="mt-4 space-y-2 text-sm">
          {customQuestions.map((item) => (
            <li key={item.id} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.question.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {questionTypeLabels[item.question.questionType]} · {item.required ? "Obligatorisk" : "Valgfri"}
                  </p>
                </div>

                {canEditSurvey ? (
                  <form action={removeCustomQuestionAction}>
                    <input type="hidden" name="surveyInstanceQuestionId" value={item.id} />
                    <SubmitButton pendingText="Fjerner..." className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100">
                      Fjern
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
          {customQuestions.length === 0 ? <li className="text-sm text-muted-foreground">Ingen klubspørgsmål endnu.</li> : null}
        </ul>
      </section>
    </div>
  );
}
