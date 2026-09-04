import { redirect } from "next/navigation";
import { DmuLogo } from "@/components/dmu-logo";
import { SurveyWizard, type WizardStep } from "@/components/survey-wizard";
import { prisma } from "@/lib/prisma";
import { hashSurveyToken } from "@/lib/survey-token";
import {
  isRespondentAgeGroup,
  isRespondentRole,
  isSelectableMotocrossClass,
  motocrossClassOptionGroups,
  respondentAgeGroupOptions,
  respondentRoleOptions,
  roleNeedsMotocrossClass,
} from "@/lib/survey-segments";

type LayoutItem =
  | { id: string; kind: "HEADING"; title: string }
  | { id: string; kind: "QUESTION"; questionId: string };

function parseLayoutItems(rawLayoutJson: unknown): LayoutItem[] {
  if (!rawLayoutJson || typeof rawLayoutJson !== "object") return [];
  const value = rawLayoutJson as { items?: unknown };
  if (!Array.isArray(value.items)) return [];

  const items: LayoutItem[] = [];
  for (const candidate of value.items) {
    if (!candidate || typeof candidate !== "object") continue;
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

function ErrorCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-[28px] border border-border/70 bg-card p-8 text-center shadow-sm">
        <DmuLogo compact />
        <h1 className="mt-6 text-xl font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export default async function SurveyTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tokenHash = hashSurveyToken(token);

  const invitation = await prisma.surveyInvitation.findFirst({
    where: { OR: [{ token: tokenHash }, { token }] },
    include: {
      member: true,
      surveyInstance: {
        include: {
          surveyTemplate: { select: { layoutJson: true } },
          surveyInstanceQuestions: {
            include: { question: { include: { options: { orderBy: { sortOrder: "asc" } } } } },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });

  if (!invitation) {
    return <ErrorCard title="Linket er ugyldigt" description="Spørgeskema-linket findes ikke eller er udløbet." />;
  }

  if (invitation.status === "ANSWERED") {
    return <ErrorCard title="Du har allerede svaret" description="Dette link kan kun bruges én gang. Tak for dit bidrag!" />;
  }

  const surveyIsClosed =
    invitation.surveyInstance.status !== "SENT" ||
    Boolean(invitation.surveyInstance.closesAt && invitation.surveyInstance.closesAt <= new Date());

  if (surveyIsClosed) {
    return <ErrorCard title="Spørgeskemaet er lukket" description="Tak for din interesse. Der modtages ikke længere svar." />;
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

  // ── Server action ───────────────────────────────────────────────────────
  async function submitSurveyAction(formData: FormData) {
    "use server";

    const currentInvitation = await prisma.surveyInvitation.findFirst({
      where: { OR: [{ token: tokenHash }, { token }] },
      include: {
        member: true,
        surveyInstance: {
          include: {
            surveyInstanceQuestions: {
              include: { question: { include: { options: true } } },
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

    if (surveyHasClosed || !currentInvitation) return;

    const respondentAgeGroup = String(formData.get("segment_respondentAgeGroup") ?? "");
    const respondentRole = String(formData.get("segment_respondentRole") ?? "");
    const rawMotocrossClass = String(formData.get("segment_motocrossClass") ?? "");

    if (!isRespondentAgeGroup(respondentAgeGroup) || respondentAgeGroup === "NOT_REPORTED") return;
    if (!isRespondentRole(respondentRole) || respondentRole === "NOT_REPORTED") return;

    const motocrossClass = roleNeedsMotocrossClass(respondentRole)
      ? isSelectableMotocrossClass(rawMotocrossClass)
        ? rawMotocrossClass
        : null
      : "NOT_APPLICABLE";

    if (!motocrossClass) return;

    const answersToCreate: { questionId: string; numericValue?: number; optionValue?: string; textValue?: string }[] = [];

    for (const surveyQuestion of currentInvitation.surveyInstance.surveyInstanceQuestions) {
      const fieldName = `question_${surveyQuestion.questionId}`;
      const rawValue = String(formData.get(fieldName) ?? "").trim();

      if (surveyQuestion.required && !rawValue) return;
      if (!rawValue) continue;

      if (surveyQuestion.question.questionType === "SCALE_1_5") {
        const numericValue = Number(rawValue);
        if (!Number.isInteger(numericValue) || numericValue < 1 || numericValue > 5) return;
        answersToCreate.push({ questionId: surveyQuestion.questionId, numericValue });
        continue;
      }

      if (surveyQuestion.question.questionType === "SINGLE_CHOICE") {
        const validOptionValues = new Set(surveyQuestion.question.options.map((o) => o.value));
        if (!validOptionValues.has(rawValue)) return;
        answersToCreate.push({ questionId: surveyQuestion.questionId, optionValue: rawValue });
        continue;
      }

      answersToCreate.push({ questionId: surveyQuestion.questionId, textValue: rawValue });
    }

    if (answersToCreate.length === 0) return;

    const submitted = await prisma.$transaction(async (tx) => {
      const submittedAt = new Date();
      const claim = await tx.surveyInvitation.updateMany({
        where: { id: currentInvitation.id, status: { in: ["SENT", "OPENED"] } },
        data: { status: "ANSWERED", answeredAt: submittedAt, openedAt: currentInvitation.openedAt ?? submittedAt },
      });

      if (claim.count !== 1) return false;

      const response = await tx.surveyResponse.create({
        data: {
          surveyInstanceId: currentInvitation.surveyInstanceId,
          clubId: currentInvitation.surveyInstance.clubId,
          // Segmenterne kommer altid fra den aktuelle besvarelse – aldrig fra
          // invitationens medlemsprofil eller en fast standardværdi.
          ageGroup: null,
          raceClass: null,
          memberRole: null,
          respondentAgeGroup,
          respondentRole,
          motocrossClass,
          submittedAt,
        },
      });

      for (const answer of answersToCreate) {
        await tx.surveyAnswer.create({
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

    if (!submitted) return;
    redirect("/thank-you");
  }

  // ── Byg wizard-steps ────────────────────────────────────────────────────
  const layoutItems = parseLayoutItems(invitation.surveyInstance.surveyTemplate.layoutJson);
  const questionById = new Map(
    invitation.surveyInstance.surveyInstanceQuestions.map((q) => [q.questionId, q])
  );

  const usedIds = new Set<string>();
  const steps: WizardStep[] = [
    {
      kind: "INTRO",
      title: "Medlemsspørgeskema",
      description: "Dine svar behandles fortroligt og vises kun samlet. Det tager blot et par minutter.",
    },
    {
      kind: "SEGMENT",
      id: "respondent-age-group",
      segment: "respondentAgeGroup",
      title: "Hvilken aldersgruppe tilhører du?",
      description: "Oplysningen bruges kun til at vise resultater samlet for forskellige aldersgrupper.",
      options: respondentAgeGroupOptions,
    },
    {
      kind: "SEGMENT",
      id: "respondent-role",
      segment: "respondentRole",
      title: "Hvad beskriver dig bedst i klubben?",
      description: "Oplysningen bruges kun til at vise resultater samlet på tværs af roller.",
      options: respondentRoleOptions,
    },
    {
      kind: "SEGMENT",
      id: "respondent-motocross-class",
      segment: "motocrossClass",
      title: "Hvilken motocrossklasse kører du primært i?",
      description: "Vælg den klasse du oftest eller senest har kørt i.",
      options: motocrossClassOptionGroups.flatMap((group) =>
        group.options.map((option) => ({ ...option, group: group.label }))
      ),
    },
  ];

  for (const item of layoutItems) {
    if (item.kind === "HEADING") {
      steps.push({ kind: "HEADING", id: item.id, title: item.title });
      continue;
    }

    const sq = questionById.get(item.questionId);
    if (!sq) continue;

    steps.push({
      kind: "QUESTION",
      id: item.id,
      questionId: sq.questionId,
      title: sq.question.title,
      description: sq.question.description,
      questionType: sq.question.questionType as "SCALE_1_5" | "TEXT" | "SINGLE_CHOICE",
      required: sq.required,
      options: sq.question.options.map((o) => ({ value: o.value, label: o.label })),
    });
    usedIds.add(sq.questionId);
  }

  // Tilføj spørgsmål der ikke er i layout
  for (const sq of invitation.surveyInstance.surveyInstanceQuestions) {
    if (usedIds.has(sq.questionId)) continue;
    steps.push({
      kind: "QUESTION",
      id: `fallback-${sq.id}`,
      questionId: sq.questionId,
      title: sq.question.title,
      description: sq.question.description,
      questionType: sq.question.questionType as "SCALE_1_5" | "TEXT" | "SINGLE_CHOICE",
      required: sq.required,
      options: sq.question.options.map((o) => ({ value: o.value, label: o.label })),
    });
  }

  return <SurveyWizard steps={steps} submitAction={submitSurveyAction} />;
}
