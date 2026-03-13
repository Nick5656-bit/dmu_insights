import { revalidatePath } from "next/cache";
import { z } from "zod";
import { processDueScheduledSends } from "@/lib/scheduled-sends";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const sendStatusLabel: Record<string, string> = {
  PENDING: "Planlagt",
  PROCESSED: "Sendt",
  CANCELLED: "Annulleret",
};

const surveyStatusLabel: Record<string, string> = {
  DRAFT: "Kladde",
  SCHEDULED: "Planlagt",
  SENT: "Sendt",
  CLOSED: "Lukket",
};

const createEventSchema = z.object({
  clubId: z.string().min(1),
  title: z.string().trim().min(3),
  eventDate: z.string().min(1),
  location: z.string().trim().min(2),
  eventType: z.string().trim().min(2),
});

export default async function DmuEventsPage() {
  await requireRole("DMU_ADMIN");

  const [clubs, events, scheduledSends, eventTemplate, dueCount, pendingCount] = await Promise.all([
    prisma.club.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.event.findMany({
      include: {
        club: true,
        surveyInstances: {
          include: {
            scheduledSends: {
              orderBy: { sendAt: "asc" },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { eventDate: "desc" },
      take: 120,
    }),
    prisma.scheduledSend.findMany({
      include: {
        surveyInstance: {
          include: {
            club: true,
          },
        },
      },
      orderBy: { sendAt: "asc" },
      take: 200,
    }),
    prisma.surveyTemplate.findFirst({
      where: { surveyType: "EVENT", isActive: true },
      include: {
        templateQuestions: {
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.scheduledSend.count({ where: { status: "PENDING", sendAt: { lte: new Date() } } }),
    prisma.scheduledSend.count({ where: { status: "PENDING" } }),
  ]);

  async function createEventAction(formData: FormData) {
    "use server";
    const currentSession = await requireRole("DMU_ADMIN");

    const parsed = createEventSchema.safeParse({
      clubId: String(formData.get("clubId") ?? ""),
      title: String(formData.get("title") ?? ""),
      eventDate: String(formData.get("eventDate") ?? ""),
      location: String(formData.get("location") ?? ""),
      eventType: String(formData.get("eventType") ?? ""),
    });

    if (!parsed.success) {
      return;
    }

    const template = await prisma.surveyTemplate.findFirst({
      where: { surveyType: "EVENT", isActive: true },
      include: {
        templateQuestions: {
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!template) {
      return;
    }

    const eventDate = new Date(parsed.data.eventDate);
    if (Number.isNaN(eventDate.getTime())) {
      return;
    }

    const event = await prisma.event.create({
      data: {
        clubId: parsed.data.clubId,
        title: parsed.data.title,
        eventDate,
        location: parsed.data.location,
        eventType: parsed.data.eventType,
        createdByUserId: currentSession.userId,
      },
    });

    const surveyInstance = await prisma.surveyInstance.create({
      data: {
        surveyTemplateId: template.id,
        clubId: parsed.data.clubId,
        name: `Event feedback - ${event.title}`,
        surveyType: "EVENT",
        status: "SCHEDULED",
        eventId: event.id,
        createdByUserId: currentSession.userId,
      },
    });

    if (template.templateQuestions.length > 0) {
      await prisma.surveyInstanceQuestion.createMany({
        data: template.templateQuestions.map((templateQuestion) => ({
          surveyInstanceId: surveyInstance.id,
          questionId: templateQuestion.questionId,
          sortOrder: templateQuestion.sortOrder,
          required: templateQuestion.required,
          sourceType: "CORE",
        })),
      });
    }

    const sendAt = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000);
    await prisma.scheduledSend.create({
      data: {
        surveyInstanceId: surveyInstance.id,
        sendAt,
        status: "PENDING",
        triggerType: "EVENT_PLUS_1_DAY",
      },
    });

    revalidatePath("/dmu/events");
    revalidatePath("/club/events");
    revalidatePath("/dmu/outbox");
  }

  async function processScheduledSendsAction() {
    "use server";
    await requireRole("DMU_ADMIN");

    await processDueScheduledSends();

    revalidatePath("/dmu/events");
    revalidatePath("/club/events");
    revalidatePath("/dmu/outbox");
    revalidatePath("/club/outbox");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">DMU-arrangementer</h2>
        <p className="mt-2 text-sm text-muted-foreground">Opret arrangementer, planlæg spørgeskemaer og behandl udsendelser manuelt.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Aktiv arrangementskabelon</p>
            <p className="text-sm font-medium">{eventTemplate ? eventTemplate.name : "Ingen"}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Planlagte udsendelser</p>
            <p className="text-lg font-semibold">{pendingCount}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Due nu</p>
            <p className="text-lg font-semibold">{dueCount}</p>
          </article>
        </div>

        <form action={processScheduledSendsAction} className="mt-4">
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Behandl planlagte udsendelser
          </button>
        </form>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Opret event</h3>
        <form action={createEventAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium" htmlFor="clubId">
              Klub
            </label>
            <select id="clubId" name="clubId" required className="w-full rounded-md border px-3 py-2 text-sm">
              <option value="">Vælg klub</option>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium" htmlFor="title">
              Event titel
            </label>
            <input id="title" name="title" required className="w-full rounded-md border px-3 py-2 text-sm" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="eventDate">
              Event dato
            </label>
            <input id="eventDate" name="eventDate" type="date" required className="w-full rounded-md border px-3 py-2 text-sm" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="eventType">
              Event type
            </label>
            <input id="eventType" name="eventType" required className="w-full rounded-md border px-3 py-2 text-sm" placeholder="fx Træning eller Løb" />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium" htmlFor="location">
              Lokation
            </label>
            <input id="location" name="location" required className="w-full rounded-md border px-3 py-2 text-sm" />
          </div>

          <div className="md:col-span-2">
            <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Opret event + planlæg udsendelse
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Kalenderoversigt (simpel)</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Dato</th>
                <th className="py-2 pr-4">Klub</th>
                <th className="py-2 pr-4">Event</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Lokation</th>
                <th className="py-2 pr-4">Spørgeskemastatus</th>
                <th className="py-2">Planlagt send</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const linkedSurvey = event.surveyInstances[0];
                const scheduledSend = linkedSurvey?.scheduledSends?.[0];
                return (
                  <tr key={event.id} className="border-b align-top">
                    <td className="py-2 pr-4">{new Date(event.eventDate).toLocaleDateString("da-DK")}</td>
                    <td className="py-2 pr-4">{event.club.name}</td>
                    <td className="py-2 pr-4">{event.title}</td>
                    <td className="py-2 pr-4">{event.eventType}</td>
                    <td className="py-2 pr-4">{event.location}</td>
                    <td className="py-2 pr-4">{linkedSurvey ? (surveyStatusLabel[linkedSurvey.status] ?? linkedSurvey.status) : "-"}</td>
                    <td className="py-2">{scheduledSend ? `${new Date(scheduledSend.sendAt).toLocaleDateString("da-DK")} (${sendStatusLabel[scheduledSend.status] ?? scheduledSend.status})` : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {events.length === 0 ? <p className="text-sm text-muted-foreground">Ingen events endnu.</p> : null}
        </div>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Planlagte udsendelser</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Sendes</th>
                <th className="py-2 pr-4">Klub</th>
                <th className="py-2 pr-4">Spørgeskema</th>
                <th className="py-2 pr-4">Årsag</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {scheduledSends.map((scheduledSend) => (
                <tr key={scheduledSend.id} className="border-b">
                  <td className="py-2 pr-4">{new Date(scheduledSend.sendAt).toLocaleString("da-DK")}</td>
                  <td className="py-2 pr-4">{scheduledSend.surveyInstance.club.name}</td>
                  <td className="py-2 pr-4">{scheduledSend.surveyInstance.name}</td>
                  <td className="py-2 pr-4">{scheduledSend.triggerType === "EVENT_PLUS_1_DAY" ? "1 dag efter arrangement" : scheduledSend.triggerType}</td>
                  <td className="py-2">{sendStatusLabel[scheduledSend.status] ?? scheduledSend.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {scheduledSends.length === 0 ? <p className="text-sm text-muted-foreground">Ingen planlagte udsendelser.</p> : null}
        </div>
      </section>
    </div>
  );
}
