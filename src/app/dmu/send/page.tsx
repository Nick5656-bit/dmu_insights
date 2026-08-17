import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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

const batchSchema = z.object({
  templateId: z.string().min(1),
  events: z.array(eventInputSchema).min(1).max(50),
});

export default async function DmuSendPage() {
  await requireRole("DMU_ADMIN");

  const [clubs, templates] = await Promise.all([
    prisma.club.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.surveyTemplate.findMany({
      where: { surveyType: "EVENT", isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        _count: { select: { templateQuestions: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
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

    if (parsed.data.events.some((event) => new Date(event.closesAt) <= new Date(event.sendAt))) {
      redirect("/dmu/send?error=invalid_close_time");
    }

    const template = await prisma.surveyTemplate.findFirst({
      where: { id: parsed.data.templateId, surveyType: "EVENT", isActive: true },
      include: { templateQuestions: { orderBy: { sortOrder: "asc" } } },
    });
    if (!template) {
      redirect("/dmu/send?error=template_unavailable");
    }

    const activeClubIds = new Set(
      (await prisma.club.findMany({ where: { active: true }, select: { id: true } })).map((club) => club.id),
    );
    if (parsed.data.events.some((event) => !activeClubIds.has(event.clubId))) {
      redirect("/dmu/send?error=club_unavailable");
    }

    await prisma.$transaction(async (transaction) => {
      for (const item of parsed.data.events) {
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
          data: {
            surveyInstanceId: survey.id,
            sendAt,
            status: "PENDING",
            triggerType: "MANUAL",
          },
        });
      }
    });

    revalidatePath("/dmu/calendar");
    revalidatePath("/dmu/send");
    revalidatePath("/dmu/dashboard");
    redirect("/dmu/calendar?success=events_created");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)] [&_p.text-muted-foreground]:text-white/75">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">Udsend spørgeskema</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Opret arrangementer og planlæg udsendelse</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Guiden opretter en event-survey pr. arrangement. Deltagerne uploades senere på arrangementsdagen.</p>
      </section>

      <SendSurveyWizard
        templates={templates.map((template) => ({ ...template, questionCount: template._count.templateQuestions }))}
        clubs={clubs}
        createBatchAction={createBatchAction}
      />
    </div>
  );
}
