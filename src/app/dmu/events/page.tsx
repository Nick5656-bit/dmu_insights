import { revalidatePath } from "next/cache";
import Link from "next/link";
import { z } from "zod";
import { EventCalendar, type EventCalendarItem } from "@/components/event-calendar";
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
  templateId: z.string().min(1),
  title: z.string().trim().min(3),
  eventDate: z.string().min(1),
  location: z.string().trim().min(2),
  eventType: z.string().trim().min(2),
});

type DmuEventsPageProps = {
  searchParams: Promise<{
    clubReady?: string;
  }>;
};

export default async function DmuEventsPage({ searchParams }: DmuEventsPageProps) {
  await requireRole("DMU_ADMIN");
  const params = await searchParams;
  const todayKey = new Date().toISOString().slice(0, 10);
  const readyFilter = params.clubReady === "ready" || params.clubReady === "awaiting" ? params.clubReady : "all";

  const [clubs, events, scheduledSends, eventTemplates, pendingCount] = await Promise.all([
    prisma.club.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.event.findMany({
      include: {
        club: true,
        surveyInstances: {
          include: {
            surveyTemplate: {
              select: {
                name: true,
              },
            },
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
            surveyTemplate: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { sendAt: "asc" },
      take: 200,
    }),
    prisma.surveyTemplate.findMany({
      where: { surveyType: "EVENT", isActive: true },
      include: {
        templateQuestions: {
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    }),
    prisma.scheduledSend.count({ where: { status: "PENDING" } }),
  ]);

  async function createEventAction(formData: FormData) {
    "use server";
    const currentSession = await requireRole("DMU_ADMIN");

    const parsed = createEventSchema.safeParse({
      clubId: String(formData.get("clubId") ?? ""),
      templateId: String(formData.get("templateId") ?? ""),
      title: String(formData.get("title") ?? ""),
      eventDate: String(formData.get("eventDate") ?? ""),
      location: String(formData.get("location") ?? ""),
      eventType: String(formData.get("eventType") ?? ""),
    });

    if (!parsed.success) {
      return;
    }

    const template = await prisma.surveyTemplate.findFirst({
      where: { id: parsed.data.templateId, surveyType: "EVENT", isActive: true },
      include: {
        templateQuestions: {
          orderBy: { sortOrder: "asc" },
        },
      },
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
        // PILOT: Auto-klarmelding – DMU varetager dette i stedet for klubben.
        // Fjern linjen nedenfor for at give klubben klarmelding tilbage.
        clubReadyAt: new Date(),
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

  const filteredEvents = events.filter((event) => {
    const linkedSurvey = event.surveyInstances[0];
    if (readyFilter === "ready") {
      return Boolean(linkedSurvey?.clubReadyAt);
    }
    if (readyFilter === "awaiting") {
      return !linkedSurvey?.clubReadyAt;
    }
    return true;
  });

  const filteredScheduledSends = scheduledSends.filter((scheduledSend) => {
    if (readyFilter === "ready") {
      return Boolean(scheduledSend.surveyInstance.clubReadyAt);
    }
    if (readyFilter === "awaiting") {
      return !scheduledSend.surveyInstance.clubReadyAt;
    }
    return true;
  });

  const readyEventCount = events.filter((event) => Boolean(event.surveyInstances[0]?.clubReadyAt)).length;
  const awaitingEventCount = events.filter((event) => !event.surveyInstances[0]?.clubReadyAt).length;

  const calendarItems: EventCalendarItem[] = filteredEvents.map((event) => {
    const linkedSurvey = event.surveyInstances[0];
    const scheduledSend = linkedSurvey?.scheduledSends?.[0];
    const eventDateKey = event.eventDate.toISOString().slice(0, 10);
    const hasPassedEventDate = eventDateKey < todayKey;
    const hasBeenSent = Boolean(
      linkedSurvey &&
        (linkedSurvey.status === "SENT" || linkedSurvey.status === "CLOSED" || linkedSurvey.sentAt || scheduledSend?.status === "PROCESSED")
    );
    const calendarState: EventCalendarItem["calendarState"] = hasBeenSent || hasPassedEventDate || linkedSurvey?.clubReadyAt
      ? "READY"
      : "AWAITING";

    return {
      id: event.id,
      dateKey: event.eventDate.toISOString().slice(0, 10),
      title: event.title,
      subtitle: event.club.name,
      calendarState,
      badges: [
        event.eventType,
        linkedSurvey ? surveyStatusLabel[linkedSurvey.status] ?? linkedSurvey.status : "Ingen survey",
        linkedSurvey?.clubReadyAt ? "Klub klar" : "Afventer klub",
      ],
      details: [
        {
          label: "Dato",
          value: new Date(event.eventDate).toLocaleDateString("da-DK"),
        },
        {
          label: "Klub",
          value: event.club.name,
        },
        {
          label: "Type",
          value: event.eventType,
        },
        {
          label: "Lokation",
          value: event.location,
        },
        {
          label: "Spørgeskemastatus",
          value: linkedSurvey ? surveyStatusLabel[linkedSurvey.status] ?? linkedSurvey.status : "-",
        },
        {
          label: "Skabelon",
          value: linkedSurvey?.surveyTemplate.name ?? "-",
        },
        {
          label: "Klubstatus",
          value: linkedSurvey?.clubReadyAt ? `Klar til udsendelse siden ${new Date(linkedSurvey.clubReadyAt).toLocaleString("da-DK")}` : "Afventer klubbens klarmelding",
        },
        {
          label: "Planlagt send",
          value: scheduledSend
            ? `${new Date(scheduledSend.sendAt).toLocaleDateString("da-DK")} (${sendStatusLabel[scheduledSend.status] ?? scheduledSend.status})`
            : "-",
        },
      ],
    };
  });

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)] [&>p]:text-white/75 [&_article]:rounded-[22px] [&_article]:border-white/12 [&_article]:bg-white/10 [&_article_p.text-muted-foreground]:text-white/70">
        <h2 className="text-3xl font-semibold tracking-tight text-white">Arrangementer</h2>
        <p className="mt-2 text-sm text-muted-foreground">Opret, følg op og send.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Aktive arrangementsskabeloner</p>
            <p className="text-lg font-semibold">{eventTemplates.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">{eventTemplates[0]?.name ?? "Ingen aktive skabeloner"}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Planlagte udsendelser</p>
            <p className="text-lg font-semibold">{pendingCount}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Afventer / klar</p>
            <p className="text-lg font-semibold">{awaitingEventCount} / {readyEventCount}</p>
          </article>
        </div>

        <form action={processScheduledSendsAction} className="mt-4">
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Behandl planlagte udsendelser
          </button>
        </form>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Nyt arrangement</h3>
        <form action={createEventAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium" htmlFor="templateId">
              Event-skabelon
            </label>
            <select id="templateId" name="templateId" required className="w-full rounded-md border px-3 py-2 text-sm">
              <option value="">Vælg skabelon</option>
              {eventTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.templateQuestions.length} spørgsmål)
                </option>
              ))}
            </select>
          </div>

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Kalender</h3>
            <p className="mt-1 text-sm text-muted-foreground">Filtrér på klubstatus.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dmu/events" className={`rounded-md border px-3 py-2 text-sm font-medium ${readyFilter === "all" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              Alle
            </Link>
            <Link href="/dmu/events?clubReady=awaiting" className={`rounded-md border px-3 py-2 text-sm font-medium ${readyFilter === "awaiting" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              Afventer klarmelding
            </Link>
            <Link href="/dmu/events?clubReady=ready" className={`rounded-md border px-3 py-2 text-sm font-medium ${readyFilter === "ready" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              Klar til udsendelse
            </Link>
          </div>
        </div>
      </section>

      <EventCalendar
        description="Klik på en dag for detaljer."
        items={calendarItems}
        emptyText="Ingen arrangementer på den valgte dag."
      />

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Planlagte udsendelser</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Sendes</th>
                <th className="py-2 pr-4">Klub</th>
                <th className="py-2 pr-4">Spørgeskema</th>
                <th className="py-2 pr-4">Skabelon</th>
                <th className="py-2 pr-4">Klubstatus</th>
                <th className="py-2 pr-4">Årsag</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredScheduledSends.map((scheduledSend) => (
                <tr key={scheduledSend.id} className="border-b">
                  <td className="py-2 pr-4">{new Date(scheduledSend.sendAt).toLocaleString("da-DK")}</td>
                  <td className="py-2 pr-4">{scheduledSend.surveyInstance.club.name}</td>
                  <td className="py-2 pr-4">{scheduledSend.surveyInstance.name}</td>
                  <td className="py-2 pr-4">{scheduledSend.surveyInstance.surveyTemplate.name}</td>
                  <td className="py-2 pr-4">
                    {scheduledSend.surveyInstance.clubReadyAt
                      ? "Klar til udsendelse"
                      : "Afventer klubbens klarmelding"}
                  </td>
                  <td className="py-2 pr-4">{scheduledSend.triggerType === "EVENT_PLUS_1_DAY" ? "1 dag efter arrangement" : scheduledSend.triggerType}</td>
                  <td className="py-2">{sendStatusLabel[scheduledSend.status] ?? scheduledSend.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredScheduledSends.length === 0 ? <p className="text-sm text-muted-foreground">Ingen planlagte udsendelser for det valgte filter.</p> : null}
        </div>
      </section>
    </div>
  );
}
