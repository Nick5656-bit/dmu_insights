import Link from "next/link";
import { DmuDeliveryTabs } from "@/components/dmu-delivery-tabs";
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
  searchParams: Promise<{ clubId?: string; mailStatus?: string; responseState?: string; show?: string }>;
}) {
  await requireRole("DMU_ADMIN");

  const { clubId, mailStatus, responseState, show } = await searchParams;
  const shouldShowDetails = show === "1";
  const mailStatusFilter = mailStatus === "SENT" || mailStatus === "FAILED" ? mailStatus : undefined;
  const responseStateFilter = responseState === "ANSWERED" || responseState === "NOT_ANSWERED" ? responseState : undefined;

  const [clubs, totalMailCount, failedMailCount, latestMailLog] = await Promise.all([
    prisma.club.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
    prisma.mailLog.count(),
    prisma.mailLog.count({ where: { status: "FAILED" } }),
    prisma.mailLog.findFirst({
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    }),
  ]);

  const clubSummaries = await Promise.all(
    clubs.map(async (club) => {
      const instances = await prisma.surveyInstance.findMany({
        where: { clubId: club.id },
        select: { id: true },
      });
      const instanceIds = instances.map((i) => i.id);

      const invitationIds: string[] =
        instanceIds.length === 0
          ? []
          : (
              await prisma.surveyInvitation.findMany({
                where: { surveyInstanceId: { in: instanceIds } },
                select: { id: true },
              })
            ).map((invitation) => invitation.id);

      const logs =
        invitationIds.length === 0
          ? []
          : await prisma.mailLog.findMany({
              where: { surveyInvitationId: { in: invitationIds } },
              orderBy: { sentAt: "desc" },
              select: { sentAt: true, status: true },
            });

      return {
        club,
        total: logs.length,
        lastSentAt: logs[0]?.sentAt ?? null,
        failed: logs.filter((log) => log.status === "FAILED").length,
      };
    })
  );

  let detailedWhereInvitationIds: string[] | null = null;
  if (clubId) {
    const instances = await prisma.surveyInstance.findMany({
      where: { clubId },
      select: { id: true },
    });

    const instanceIds = instances.map((instance) => instance.id);
    detailedWhereInvitationIds =
      instanceIds.length === 0
        ? []
        : (
            await prisma.surveyInvitation.findMany({
              where: { surveyInstanceId: { in: instanceIds } },
              select: { id: true },
            })
          ).map((invitation) => invitation.id);
  }

  const detailedLogs =
    !shouldShowDetails || (detailedWhereInvitationIds !== null && detailedWhereInvitationIds.length === 0)
      ? []
      : await prisma.mailLog.findMany({
          where: {
            ...(detailedWhereInvitationIds ? { surveyInvitationId: { in: detailedWhereInvitationIds } } : {}),
            ...(mailStatusFilter ? { status: mailStatusFilter } : {}),
            ...(responseStateFilter === "ANSWERED"
              ? { surveyInvitation: { status: "ANSWERED" } }
              : responseStateFilter === "NOT_ANSWERED"
                ? { surveyInvitation: { status: { in: ["CREATED", "SENT", "OPENED"] } } }
                : {}),
          },
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
          take: 100,
        });

  const selectedClub = clubId ? clubs.find((club) => club.id === clubId) : null;
  const hasActiveFilters = Boolean(clubId || mailStatusFilter || responseStateFilter);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)] [&_p.text-muted-foreground]:text-white/75 [&_article]:rounded-[22px] [&_article]:border-white/12 [&_article]:bg-white/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Udsendelser</p>
            <h2 className="mt-2 text-2xl font-bold">Mailhistorik</h2>
            <p className="mt-1 text-sm text-muted-foreground">Alle afsendte mails og deres status.</p>
          </div>
          <DmuDeliveryTabs variant="dark" />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <article className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Mails i alt</p>
            <p className="mt-1 text-2xl font-semibold">{totalMailCount}</p>
          </article>
          <article className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Sidst afsendt</p>
            <p className="mt-1 text-2xl font-semibold">{latestMailLog ? formatDateShort(latestMailLog.sentAt) : "–"}</p>
          </article>
          <article className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Fejlede udsendelser</p>
            <p className={`mt-1 text-2xl font-semibold ${failedMailCount > 0 ? "text-red-600" : "text-emerald-700"}`}>{failedMailCount}</p>
          </article>
        </div>
      </section>

      {!clubId && (
        <section className="rounded-xl border bg-background p-6">
          <h3 className="mb-4 text-base font-semibold">Kluboversigt</h3>
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
                      {failed > 0 ? <span className="font-medium text-red-600">{failed}</span> : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="py-3 pr-6 text-muted-foreground">{lastSentAt ? formatDateShort(lastSentAt) : "Ingen mails"}</td>
                    <td className="py-3">
                      {total > 0 && (
                        <Link href={`/dmu/settings/mail-log?clubId=${club.id}&show=1`} className="rounded-md border border-border px-3 py-1 text-xs hover:bg-muted">
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

      <section className="rounded-xl border bg-background p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">Filtre</h3>
          </div>
        </div>

        <form method="get" className="mt-4 grid gap-3 md:grid-cols-4">
          <input type="hidden" name="show" value="1" />

          <select
            name="clubId"
            defaultValue={clubId ?? ""}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Alle klubber</option>
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
              </option>
            ))}
          </select>

          <select
            name="mailStatus"
            defaultValue={mailStatusFilter ?? ""}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Alle mail-statusser</option>
            <option value="SENT">Sendt</option>
            <option value="FAILED">Fejlet</option>
          </select>

          <select
            name="responseState"
            defaultValue={responseStateFilter ?? ""}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Alle svar-statusser</option>
            <option value="ANSWERED">Besvaret</option>
            <option value="NOT_ANSWERED">Ikke besvaret</option>
          </select>

          <div className="flex gap-3">
            <button
              type="submit"
              className="h-10 flex-1 rounded-md bg-foreground px-4 text-sm font-medium text-background hover:bg-foreground/80"
            >
              Vis mails
            </button>

            {(shouldShowDetails || hasActiveFilters) && (
              <Link
                href="/dmu/settings/mail-log"
                className="flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm text-muted-foreground hover:bg-muted"
              >
                Nulstil
              </Link>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="mb-1 text-base font-semibold">{selectedClub ? `Mails til ${selectedClub.name}` : "Alle sendte mails"}</h3>
        <p className="mb-4 text-sm text-muted-foreground">{selectedClub ? `Seneste 100 mails i ${selectedClub.name}.` : "Seneste 100 mails."}</p>

        {!shouldShowDetails ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Vælg filtre og hent listen.
          </div>
        ) : detailedLogs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Ingen mails fundet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Modtager</th>
                  {!selectedClub && <th className="pb-3 pr-4 font-medium">Klub</th>}
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
                        <Link href={`/dmu/settings/mail-log?clubId=${log.surveyInvitation.surveyInstance.clubId}&show=1`} className="hover:underline">
                          {log.surveyInvitation.surveyInstance.club.name}
                        </Link>
                      </td>
                    )}
                    <td className="max-w-[260px] py-3 pr-4 truncate" title={log.subject}>
                      {log.subject}
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">{formatDate(log.sentAt)}</td>
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
