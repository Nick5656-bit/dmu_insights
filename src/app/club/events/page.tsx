import { EventCalendar, type EventCalendarItem } from "@/components/event-calendar";
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

export default async function ClubEventsPage() {
  const session = await requireRole("CLUB_ADMIN");
  const todayKey = new Date().toISOString().slice(0, 10);

  const events = await prisma.event.findMany({
    where: {
      clubId: session.clubId ?? undefined,
    },
    include: {
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
          _count: {
            select: {
              responses: true,
              invitations: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { eventDate: "desc" },
  });

  const pendingCount = events.flatMap((event) => event.surveyInstances).flatMap((instance) => instance.scheduledSends).filter((send) => send.status === "PENDING").length;

  const calendarItems: EventCalendarItem[] = events.map((event) => {
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
      subtitle: event.location,
      calendarState,
      badges: [
        event.eventType,
        linkedSurvey ? surveyStatusLabel[linkedSurvey.status] ?? linkedSurvey.status : "Ingen survey",
        linkedSurvey?.clubReadyAt ? "Klar til udsendelse" : "Afventer klarmelding",
      ],
      details: [
        {
          label: "Dato",
          value: new Date(event.eventDate).toLocaleDateString("da-DK"),
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
        {
          label: "Kan redigeres indtil",
          value: linkedSurvey && scheduledSend && linkedSurvey.status !== "SENT" && linkedSurvey.status !== "CLOSED"
            ? new Date(scheduledSend.sendAt).toLocaleString("da-DK")
            : linkedSurvey
              ? "Låst efter udsendelse"
              : "-",
        },
        {
          label: "Svar / invitationer",
          value: linkedSurvey ? `${linkedSurvey._count.responses} / ${linkedSurvey._count.invitations}` : "-",
        },
      ],
    };
  });

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)] [&>p]:text-white/75 [&_article]:rounded-[22px] [&_article]:border-white/12 [&_article]:bg-white/10 [&_article_p.text-muted-foreground]:text-white/70">
        <h2 className="text-3xl font-semibold tracking-tight text-white">Arrangementer</h2>
        <p className="mt-2 text-sm text-muted-foreground">Status og næste skridt.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Arrangementer</p>
            <p className="text-lg font-semibold">{events.length}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Planlagte udsendelser</p>
            <p className="text-lg font-semibold">{pendingCount}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Bemærk</p>
            <p className="text-sm">DMU sender manuelt.</p>
          </article>
        </div>
      </section>

      <EventCalendar
        title="Kalender"
        description="Klik på en dag for detaljer."
        items={calendarItems}
        emptyText="Ingen arrangementer på den valgte dag."
      />
    </div>
  );
}
