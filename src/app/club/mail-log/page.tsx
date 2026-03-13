import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const mailStatusLabel: Record<string, string> = {
  SENT: "Sendt",
  FAILED: "Fejlet",
};

const mailStatusColor: Record<string, string> = {
  SENT: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
};

const invitationStatusLabel: Record<string, string> = {
  SENT: "Afsendt",
  OPENED: "Åbnet",
  ANSWERED: "Besvaret",
  EXPIRED: "Udløbet",
};

const invitationStatusColor: Record<string, string> = {
  SENT: "bg-blue-100 text-blue-800",
  OPENED: "bg-yellow-100 text-yellow-800",
  ANSWERED: "bg-green-100 text-green-800",
  EXPIRED: "bg-gray-100 text-gray-600",
};

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));
}

function formatDateShort(d: Date) {
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(d));
}

export default async function ClubMailLogPage() {
  const session = await requireRole("CLUB_ADMIN");

  if (!session.clubId) {
    return (
      <div className="rounded-xl border bg-background p-6 text-sm text-muted-foreground">
        Din konto er ikke tilknyttet en klub. Kontakt DMU for hjælp.
      </div>
    );
  }

  const clubId = session.clubId;

  // Step 1: club info + survey instance IDs
  const [club, surveyInstances] = await Promise.all([
    prisma.club.findUnique({ where: { id: clubId } }),
    prisma.surveyInstance.findMany({
      where: { clubId },
      select: { id: true },
    }),
  ]);

  const instanceIds = surveyInstances.map((s) => s.id);

  // Step 2: invitation IDs — guard against empty array ({ in: [] } is invalid in SQLite)
  const invitationIds: string[] =
    instanceIds.length === 0
      ? []
      : (
          await prisma.surveyInvitation.findMany({
            where: { surveyInstanceId: { in: instanceIds } },
            select: { id: true },
          })
        ).map((i) => i.id);

  // Step 3: mail logs — guard against empty array
  const mailLogs =
    invitationIds.length === 0
      ? []
      : await prisma.mailLog.findMany({
          where: { surveyInvitationId: { in: invitationIds } },
          include: {
            surveyInvitation: {
              include: {
                surveyInstance: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { sentAt: "desc" },
        });

  const sentCount = mailLogs.length;
  const failedCount = mailLogs.filter((l) => l.status === "FAILED").length;
  const answeredCount = mailLogs.filter(
    (l) => l.surveyInvitation.status === "ANSWERED"
  ).length;
  const lastSentAt = mailLogs[0]?.sentAt ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">Mail-log</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Alle mails som DMU har afsendt til medlemmer i{" "}
          <span className="font-medium text-foreground">{club?.name}</span>.
        </p>

        {/* Summary cards */}
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <article className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Mails afsendt</p>
            <p className="mt-1 text-2xl font-semibold">{sentCount}</p>
          </article>
          <article className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Besvarelser</p>
            <p className="mt-1 text-2xl font-semibold text-green-700">{answeredCount}</p>
          </article>
          <article className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Fejlede udsendelser</p>
            <p className="mt-1 text-2xl font-semibold text-red-600">{failedCount}</p>
          </article>
          <article className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Seneste mail</p>
            <p className="mt-1 text-2xl font-semibold">
              {lastSentAt ? formatDateShort(lastSentAt) : "–"}
            </p>
          </article>
        </div>
      </section>

      {/* Mail table */}
      <section className="rounded-xl border bg-background p-6">
        <h3 className="mb-4 text-base font-semibold">Afsendelseshistorik</h3>

        {mailLogs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Der er endnu ikke sendt nogen mails til din klub.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Modtager</th>
                  <th className="pb-3 pr-4 font-medium">Spørgeskema</th>
                  <th className="pb-3 pr-4 font-medium">Emne</th>
                  <th className="pb-3 pr-4 font-medium">Sendt</th>
                  <th className="pb-3 pr-4 font-medium">Mail-status</th>
                  <th className="pb-3 font-medium">Svar-status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {mailLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30">
                    <td className="py-3 pr-4 text-muted-foreground">{log.toEmail}</td>
                    <td className="py-3 pr-4 max-w-[180px] truncate text-muted-foreground" title={log.surveyInvitation.surveyInstance.name}>
                      {log.surveyInvitation.surveyInstance.name}
                    </td>
                    <td className="py-3 pr-4 max-w-[220px] truncate" title={log.subject}>
                      {log.subject}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                      {formatDate(log.sentAt)}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          mailStatusColor[log.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {mailStatusLabel[log.status] ?? log.status}
                      </span>
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          invitationStatusColor[log.surveyInvitation.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {invitationStatusLabel[log.surveyInvitation.status] ?? log.surveyInvitation.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
