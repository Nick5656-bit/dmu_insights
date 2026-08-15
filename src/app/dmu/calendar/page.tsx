import Link from "next/link";
import { EventCalendar, type EventCalendarItem } from "@/components/event-calendar";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const surveyStatusLabel: Record<string, string> = {
  DRAFT: "Planlagt",
  SCHEDULED: "Planlagt",
  SENT: "Sendt",
  CLOSED: "Lukket",
};

function formatDateTime(value: Date | null | undefined) {
  if (!value) {
    return "Ikke planlagt";
  }

  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function DmuCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  await requireRole("DMU_ADMIN");
  const params = await searchParams;

  const events = await prisma.event.findMany({
    include: {
      club: { select: { name: true } },
      _count: { select: { participants: true } },
      surveyInstances: {
        include: {
          surveyTemplate: { select: { name: true } },
          scheduledSends: { orderBy: { sendAt: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
  });

  const calendarItems: EventCalendarItem[] = events.map((event) => {
    const survey = event.surveyInstances[0];
    const scheduledSend = survey?.scheduledSends[0];
    const status = surveyStatusLabel[survey?.status ?? "SCHEDULED"] ?? "Planlagt";
    const isReady = Boolean(event._count.participants > 0 || survey?.status === "SENT" || survey?.status === "CLOSED");

    return {
      id: event.id,
      dateKey: event.eventDate.toISOString().slice(0, 10),
      title: event.title,
      subtitle: event.club.name,
      calendarState: isReady ? "READY" : "AWAITING",
      badges: [event.eventType, status, `${event._count.participants} deltagere`],
      actions: [
        {
          label: "Åbn arrangement",
          href: `/dmu/events/${event.id}`,
          variant: "primary",
        },
      ],
      details: [
        { label: "Klub", value: event.club.name },
        { label: "Lokation", value: event.location },
        { label: "Skabelon", value: survey?.surveyTemplate.name ?? "Ingen tilknyttet skabelon" },
        { label: "Sendetidspunkt", value: formatDateTime(scheduledSend?.sendAt) },
        { label: "Status", value: status },
      ],
    };
  });

  const upcomingCount = events.filter((event) => event.eventDate >= new Date()).length;
  const participantCount = events.reduce((total, event) => total + event._count.participants, 0);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)] [&_p.text-muted-foreground]:text-white/75 [&_article]:rounded-[22px] [&_article]:border-white/12 [&_article]:bg-white/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">Arrangementer</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">Kalender</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Følg alle arrangementer og åbn dem for at håndtere deltagerlisten.</p>
          </div>
          <Link href="/dmu/send" className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-primary shadow-sm transition hover:bg-white/92">
            Udsend spørgeskema
          </Link>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <article className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Arrangementer i alt</p>
            <p className="mt-1 text-2xl font-semibold">{events.length}</p>
          </article>
          <article className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Kommende</p>
            <p className="mt-1 text-2xl font-semibold">{upcomingCount}</p>
          </article>
          <article className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Deltagere uploadet</p>
            <p className="mt-1 text-2xl font-semibold">{participantCount}</p>
          </article>
        </div>
      </section>

      {params.success === "events_created" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Arrangementerne og deres planlagte udsendelser er oprettet. Upload deltagerne på hvert arrangement før sendetidspunktet.
        </div>
      ) : null}

      <EventCalendar
        title="Alle arrangementer"
        description="Åbn et arrangement i dagsoversigten for at tilføje eller fjerne deltagere."
        items={calendarItems}
        emptyText="Ingen arrangementer på den valgte dag."
      />
    </div>
  );
}
