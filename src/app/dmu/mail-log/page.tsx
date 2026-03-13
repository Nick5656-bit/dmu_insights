import Link from "next/link";
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

export default async function DmuMailLogPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string }>;
}) {
  await requireRole("DMU_ADMIN");
  const { clubId } = await searchParams;

  // All clubs for the dropdown + overview
  const clubs = await prisma.club.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  // Per-club mail summary — resolve via instance IDs to avoid nested filter limitation
  const clubSummaries = await Promise.all(
    clubs.map(async (club) => {
      const instances = await prisma.surveyInstance.findMany({
        where: { clubId: club.id },
        select: { id: true },
      });
      const instanceIds = instances.map((i) => i.id);

      const invIds: string[] =
        instanceIds.length === 0
          ? []
          : (
              await prisma.surveyInvitation.findMany({
                where: { surveyInstanceId: { in: instanceIds } },
                select: { id: true },
              })
            ).map((i) => i.id);

      const logs =
        invIds.length === 0
          ? []
          : await prisma.mailLog.findMany({
              where: { surveyInvitationId: { in: invIds } },
              orderBy: { sentAt: "desc" },
              select: { sentAt: true, status: true },
            });
      return {
        club,
        total: logs.length,
        lastSentAt: logs[0]?.sentAt ?? null,
        failed: logs.filter((l) => l.status === "FAILED").length,
      };
    })
  );

  // Detailed mail log — resolve IDs step-by-step with empty-array guards
  let detailedWhereInvitationIds: string[] | null = null;
  if (clubId) {
    const instances = await prisma.surveyInstance.findMany({
      where: { clubId },
      select: { id: true },
    });
    const instanceIds = instances.map((i) => i.id);
    detailedWhereInvitationIds =
      instanceIds.length === 0
        ? []
        : (
            await prisma.surveyInvitation.findMany({
              where: { surveyInstanceId: { in: instanceIds } },
              select: { id: true },
            })
          ).map((i) => i.id);
  }

  const detailedLogs =
    detailedWhereInvitationIds !== null && detailedWhereInvitationIds.length === 0
      ? []
      : await prisma.mailLog.findMany({
          where: detailedWhereInvitationIds
            ? { surveyInvitationId: { in: detailedWhereInvitationIds } }
            : {},
    include: {
      surveyInvitation: {
        include: {
          surveyInstance: {
            include: { club: true },
          },
        },
      },
    },
    orderBy: { sentAt: "desc" },
    take: 200,
  });

  const selectedClub = clubId ? clubs.find((c) => c.id === clubId) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-xl border bg-background p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Mail-log</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Oversigt over alle mails DMU har sendt til klubber i forbindelse med spørgeskemaer.
            </p>
          </div>
          {/* Club filter */}
          <form method="get" className="flex items-center gap-2">
            <select
              name="clubId"
              defaultValue={clubId ?? ""}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Alle klubber</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/80"
            >
              Filtrer
            </button>
            {clubId && (
              <Link
                href="/dmu/mail-log"
                className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                Nulstil
              </Link>
            )}
          </form>
        </div>

        {/* Summary cards */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <article className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Mails i alt</p>
            <p className="mt-1 text-2xl font-semibold">{detailedLogs.length}</p>
          </article>
          <article className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Sidst afsendt</p>
            <p className="mt-1 text-2xl font-semibold">
              {detailedLogs[0]
                ? formatDateShort(detailedLogs[0].sentAt)
                : "–"}
            </p>
          </article>
          <article className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Fejlede udsendelser</p>
            <p className="mt-1 text-2xl font-semibold text-red-600">
              {detailedLogs.filter((l) => l.status === "FAILED").length}
            </p>
          </article>
        </div>
      </section>

      {/* Club overview (shown when no club is selected) */}
      {!clubId && (
        <section className="rounded-xl border bg-background p-6">
          <h3 className="mb-4 text-base font-semibold">Kluboversigt</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Klik på en klub for at se dens mail-historik.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 pr-6 font-medium">Klub</th>
                  <th className="pb-3 pr-6 font-medium">By</th>
                  <th className="pb-3 pr-6 font-medium">Mails sendt</th>
                  <th className="pb-3 pr-6 font-medium">Fejlet</th>
                  <th className="pb-3 pr-6 font-medium">Seneste mail</th>
                  <th className="pb-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {clubSummaries.map(({ club, total, lastSentAt, failed }) => (
                  <tr key={club.id} className="hover:bg-muted/30">
                    <td className="py-3 pr-6 font-medium">{club.name}</td>
                    <td className="py-3 pr-6 text-muted-foreground">{club.city}</td>
                    <td className="py-3 pr-6">{total}</td>
                    <td className="py-3 pr-6">
                      {failed > 0 ? (
                        <span className="font-medium text-red-600">{failed}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="py-3 pr-6 text-muted-foreground">
                      {lastSentAt ? formatDateShort(lastSentAt) : "Ingen mails"}
                    </td>
                    <td className="py-3">
                      {total > 0 && (
                        <Link
                          href={`/dmu/mail-log?clubId=${club.id}`}
                          className="rounded-md border border-border px-3 py-1 text-xs hover:bg-muted"
                        >
                          Se mails →
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Detailed mail log */}
      <section className="rounded-xl border bg-background p-6">
        <h3 className="mb-1 text-base font-semibold">
          {selectedClub ? `Mails til ${selectedClub.name}` : "Alle sendte mails"}
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          {selectedClub
            ? `Viser alle mails afsendt til medlemmer i ${selectedClub.name}.`
            : "Viser de seneste 200 mails på tværs af alle klubber."}
        </p>

        {detailedLogs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Ingen mails fundet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Modtager</th>
                  {!selectedClub && (
                    <th className="pb-3 pr-4 font-medium">Klub</th>
                  )}
                  <th className="pb-3 pr-4 font-medium">Emne</th>
                  <th className="pb-3 pr-4 font-medium">Sendt</th>
                  <th className="pb-3 pr-4 font-medium">Mail-status</th>
                  <th className="pb-3 font-medium">Svar-status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {detailedLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30">
                    <td className="py-3 pr-4 text-muted-foreground">{log.toEmail}</td>
                    {!selectedClub && (
                      <td className="py-3 pr-4 font-medium">
                        <Link
                          href={`/dmu/mail-log?clubId=${log.surveyInvitation.surveyInstance.clubId}`}
                          className="hover:underline"
                        >
                          {log.surveyInvitation.surveyInstance.club.name}
                        </Link>
                      </td>
                    )}
                    <td className="py-3 pr-4 max-w-[260px] truncate" title={log.subject}>
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
