import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SurveyType } from "@prisma/client";
import { z } from "zod";
import { SendSurveyWizard } from "@/components/send-survey-wizard";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const eventInputSchema = z.object({
  clubId: z.string().min(1),
  title: z.string().trim().min(3).max(160),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  location: z.string().trim().min(2).max(160),
  eventType: z.string().trim().min(2).max(80),
  sendAt: z.string().datetime({ offset: true }),
  closesAt: z.string().datetime({ offset: true }),
});

const batchSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("EVENT"),
    templateId: z.string().min(1),
    events: z.array(eventInputSchema).min(1).max(50),
  }),
  z.object({
    mode: z.literal("ANNUAL"),
    templateId: z.string().min(1),
    clubIds: z.array(z.string().min(1)).min(1).max(50),
    sendAt: z.string().datetime({ offset: true }),
    closesAt: z.string().datetime({ offset: true }),
  }),
]);

export default async function DmuSendPage() {
  await requireRole("DMU_ADMIN");

  const [clubs, templates] = await Promise.all([
    prisma.club.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.surveyTemplate.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        surveyType: true,
        _count: { select: { templateQuestions: true } },
      },
      orderBy: [{ surveyType: "asc" }, { updatedAt: "desc" }, { name: "asc" }],
    }),
  ]);

  async function createBatchAction(formData: FormData) {
    "use server";
    const session = await requireRole("DMU_ADMIN");

    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(String(formData.get("payload") ?? ""));
    } catch {
      redirect("/dmu/send?error=invalid_payload");
    }

    const parsed = batchSchema.safeParse(rawPayload);
    if (!parsed.success) {
      redirect("/dmu/send?error=invalid_payload");
    }

    const payload = parsed.data;
    const activeClubIds = new Set(
      (await prisma.club.findMany({ where: { active: true }, select: { id: true } })).map((club) => club.id),
    );

    if (payload.mode === "ANNUAL") {
      const sendAt = new Date(payload.sendAt);
      const closesAt = new Date(payload.closesAt);
      if (Number.isNaN(sendAt.getTime()) || Number.isNaN(closesAt.getTime()) || closesAt <= sendAt) {
        redirect("/dmu/send?error=invalid_close_time");
      }

      const clubIds = [...new Set(payload.clubIds)];
      if (clubIds.some((clubId) => !activeClubIds.has(clubId))) {
        redirect("/dmu/send?error=club_unavailable");
      }

      const template = await prisma.surveyTemplate.findFirst({
        where: { id: payload.templateId, isActive: true, surveyType: SurveyType.ANNUAL },
        include: { templateQuestions: { orderBy: { sortOrder: "asc" } } },
      });
      if (!template) {
        redirect("/dmu/send?error=template_unavailable");
      }

      await prisma.$transaction(async (transaction) => {
        const dateLabel = new Intl.DateTimeFormat("da-DK", { day: "2-digit", month: "short", year: "numeric" }).format(sendAt);

        for (const clubId of clubIds) {
          const survey = await transaction.surveyInstance.create({
            data: {
              surveyTemplateId: template.id,
              clubId,
              name: `${template.name} - ${dateLabel}`,
              surveyType: "ANNUAL",
              status: "SCHEDULED",
              createdByUserId: session.userId,
              // DMU opretter og planlægger denne måling direkte for klubben.
              clubReadyAt: new Date(),
              closesAt,
            },
          });

          if (template.templateQuestions.length > 0) {
            await transaction.surveyInstanceQuestion.createMany({
              data: template.templateQuestions.map((question) => ({
                surveyInstanceId: survey.id,
                questionId: question.questionId,
                sortOrder: question.sortOrder,
                required: question.required,
                sourceType: "CORE" as const,
              })),
            });
          }

          await transaction.scheduledSend.create({
            data: { surveyInstanceId: survey.id, sendAt, status: "PENDING", triggerType: "MANUAL" },
          });
        }
      });

      revalidatePath("/dmu/send");
      revalidatePath("/dmu/surveys");
      revalidatePath("/dmu/outbox");
      revalidatePath("/dmu/dashboard");
      redirect("/dmu/surveys?surveyType=ANNUAL&status=SCHEDULED");
    }

    if (payload.events.some((event) => new Date(event.closesAt) <= new Date(event.sendAt))) {
      redirect("/dmu/send?error=invalid_close_time");
    }

    const clubIds = [...new Set(payload.events.map((event) => event.clubId))];
    if (clubIds.some((clubId) => !activeClubIds.has(clubId))) {
      redirect("/dmu/send?error=club_unavailable");
    }

    const template = await prisma.surveyTemplate.findFirst({
      where: { id: payload.templateId, isActive: true, surveyType: SurveyType.EVENT },
      include: { templateQuestions: { orderBy: { sortOrder: "asc" } } },
    });
    if (!template) {
      redirect("/dmu/send?error=template_unavailable");
    }

    await prisma.$transaction(async (transaction) => {
      for (const item of payload.events) {
        const eventDate = new Date(`${item.eventDate}T12:00:00.000Z`);
        const sendAt = new Date(item.sendAt);
        const closesAt = new Date(item.closesAt);
        if (Number.isNaN(eventDate.getTime()) || Number.isNaN(sendAt.getTime()) || Number.isNaN(closesAt.getTime())) {
          throw new Error("Invalid event date or send time");
        }

        const event = await transaction.event.create({
          data: {
            clubId: item.clubId,
            title: item.title,
            eventDate,
            location: item.location,
            eventType: item.eventType,
            createdByUserId: session.userId,
          },
        });

        const survey = await transaction.surveyInstance.create({
          data: {
            surveyTemplateId: template.id,
            clubId: item.clubId,
            name: `Event feedback - ${event.title}`,
            surveyType: "EVENT",
            status: "SCHEDULED",
            eventId: event.id,
            createdByUserId: session.userId,
            // PILOT: DMU administrerer udsendelsen; klubben skal ikke klarmelde.
            clubReadyAt: new Date(),
            closesAt,
          },
        });

        if (template.templateQuestions.length > 0) {
          await transaction.surveyInstanceQuestion.createMany({
            data: template.templateQuestions.map((question) => ({
              surveyInstanceId: survey.id,
              questionId: question.questionId,
              sortOrder: question.sortOrder,
              required: question.required,
              sourceType: "CORE" as const,
            })),
          });
        }

        await transaction.scheduledSend.create({
          data: { surveyInstanceId: survey.id, sendAt, status: "PENDING", triggerType: "MANUAL" },
        });
      }
    });

    revalidatePath("/dmu/calendar");
    revalidatePath("/dmu/send");
    revalidatePath("/dmu/surveys");
    revalidatePath("/dmu/outbox");
    revalidatePath("/dmu/dashboard");
    redirect("/dmu/calendar?success=events_created");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)] [&_p.text-muted-foreground]:text-white/75">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">Udsend spørgeskema</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Planlæg årlige målinger og arrangementsevalueringer</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Vælg først skabelonen. Årlige målinger sendes til medlemmerne i de valgte klubber, mens arrangementsevalueringer sendes til deltagere på det enkelte arrangement.</p>
      </section>

      <SendSurveyWizard
        templates={templates.map((template) => ({ ...template, questionCount: template._count.templateQuestions }))}
        clubs={clubs}
        createBatchAction={createBatchAction}
      />
    </div>
  );
}
