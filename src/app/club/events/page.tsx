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

  const events = await prisma.event.findMany({
    where: {
      clubId: session.clubId ?? undefined,
    },
    include: {
      surveyInstances: {
        include: {
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

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">Klubbens arrangementer</h2>
        <p className="mt-2 text-sm text-muted-foreground">Oversigt over arrangementer og status på planlagte spørgeskemaer.</p>
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
            <p className="text-sm">DMU behandler planlagte udsendelser manuelt.</p>
          </article>
        </div>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Kalenderoversigt (simpel)</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Dato</th>
                <th className="py-2 pr-4">Event</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Lokation</th>
                <th className="py-2 pr-4">Spørgeskemastatus</th>
                <th className="py-2 pr-4">Planlagt send</th>
                <th className="py-2">Svar / invitationer</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const linkedSurvey = event.surveyInstances[0];
                const scheduledSend = linkedSurvey?.scheduledSends?.[0];
                return (
                  <tr key={event.id} className="border-b align-top">
                    <td className="py-2 pr-4">{new Date(event.eventDate).toLocaleDateString("da-DK")}</td>
                    <td className="py-2 pr-4">{event.title}</td>
                    <td className="py-2 pr-4">{event.eventType}</td>
                    <td className="py-2 pr-4">{event.location}</td>
                    <td className="py-2 pr-4">{linkedSurvey ? (surveyStatusLabel[linkedSurvey.status] ?? linkedSurvey.status) : "-"}</td>
                    <td className="py-2 pr-4">{scheduledSend ? `${new Date(scheduledSend.sendAt).toLocaleDateString("da-DK")} (${sendStatusLabel[scheduledSend.status] ?? scheduledSend.status})` : "-"}</td>
                    <td className="py-2">{linkedSurvey ? `${linkedSurvey._count.responses} / ${linkedSurvey._count.invitations}` : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {events.length === 0 ? <p className="text-sm text-muted-foreground">Ingen arrangementer endnu.</p> : null}
        </div>
      </section>
    </div>
  );
}
