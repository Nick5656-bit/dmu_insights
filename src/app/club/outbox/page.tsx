import Link from "next/link";
import { ClubDeliveryTabs } from "@/components/club-delivery-tabs";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const invitationStatusLabel: Record<string, string> = {
  SENT: "Sendt",
  OPENED: "Åbnet",
  ANSWERED: "Besvaret",
  EXPIRED: "Udløbet",
};

type ClubOutboxPageProps = {
  searchParams: Promise<{
    surveyInstanceId?: string;
    mailStatus?: string;
    responseState?: string;
    show?: string;
  }>;
};

export default async function ClubOutboxPage({ searchParams }: ClubOutboxPageProps) {
  const session = await requireRole("CLUB_ADMIN");
  const { surveyInstanceId, mailStatus, responseState, show } = await searchParams;

  if (!session.clubId) {
    return (
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">Klubbens udsendelser</h2>
        <p className="mt-2 text-sm text-muted-foreground">Din konto er ikke tilknyttet en klub.</p>
      </section>
    );
  }

  const clubId = session.clubId;
  const shouldShowDetails = show === "1";
  const mailStatusFilter = mailStatus === "SENT" || mailStatus === "FAILED" ? mailStatus : undefined;
  const responseStateFilter = responseState === "ANSWERED" || responseState === "NOT_ANSWERED" ? responseState : undefined;

  const [club, surveyOptions, sentMailCount, failedMailCount, answeredCount, latestMailLog] = await Promise.all([
    prisma.club.findUnique({ where: { id: clubId }, select: { name: true } }),
    prisma.surveyInstance.findMany({
      where: { clubId },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.mailLog.count({
      where: {
        status: "SENT",
        surveyInvitation: {
          surveyInstance: { clubId },
        },
      },
    }),
    prisma.mailLog.count({
      where: {
        status: "FAILED",
        surveyInvitation: {
          surveyInstance: { clubId },
        },
      },
    }),
    prisma.surveyInvitation.count({
      where: {
        status: "ANSWERED",
        surveyInstance: { clubId },
      },
    }),
    prisma.mailLog.findFirst({
      where: {
        surveyInvitation: {
          surveyInstance: { clubId },
        },
      },
      select: { sentAt: true },
      orderBy: { sentAt: "desc" },
    }),
  ]);

  const selectedSurvey = surveyInstanceId ? surveyOptions.find((survey) => survey.id === surveyInstanceId) : null;
  const hasActiveFilters = Boolean(surveyInstanceId || mailStatusFilter || responseStateFilter);

  const mailLogs = shouldShowDetails
    ? await prisma.mailLog.findMany({
        where: {
          ...(mailStatusFilter ? { status: mailStatusFilter } : {}),
          surveyInvitation: {
            ...(responseStateFilter === "ANSWERED"
              ? { status: "ANSWERED" }
              : responseStateFilter === "NOT_ANSWERED"
                ? { status: { in: ["CREATED", "SENT", "OPENED"] } }
                : {}),
            ...(surveyInstanceId ? { surveyInstanceId } : {}),
            surveyInstance: { clubId },
          },
        },
        include: {
          surveyInvitation: {
            include: {
              surveyInstance: { select: { name: true } },
            },
          },
        },
        orderBy: { sentAt: "desc" },
        take: 100,
      })
    : [];

  const totalMailCount = sentMailCount + failedMailCount;

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)] [&_p.text-muted-foreground]:text-white/75 [&_article]:rounded-[22px] [&_article]:border-white/12 [&_article]:bg-white/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="text-white/75 [&_h2]:text-white [&_p]:text-white/75 [&_span.text-foreground]:text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Udsendelser</p>
            <h2 className="mt-2 text-2xl font-bold">Oversigt</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Mails til <span className="font-medium text-foreground">{club?.name ?? "din klub"}</span>.
            </p>
          </div>
          <ClubDeliveryTabs variant="dark" />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Mails i alt</p>
            <p className="text-lg font-semibold">{totalMailCount}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Sendte mails</p>
            <p className="text-lg font-semibold text-green-700">{sentMailCount}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Besvarede invitationer</p>
            <p className="text-lg font-semibold">{answeredCount}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Seneste mail</p>
            <p className="text-lg font-semibold">
              {latestMailLog
                ? new Intl.DateTimeFormat("da-DK", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  }).format(latestMailLog.sentAt)
                : "-"}
            </p>
          </article>
        </div>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-base font-semibold">Filtre</h3>

        <form method="get" className="mt-4 grid gap-3 md:grid-cols-4">
          <input type="hidden" name="show" value="1" />

          <select name="surveyInstanceId" defaultValue={surveyInstanceId ?? ""} className="h-10 rounded-md border px-3 text-sm">
            <option value="">Alle spørgeskemaer</option>
            {surveyOptions.map((survey) => (
              <option key={survey.id} value={survey.id}>
                {survey.name}
              </option>
            ))}
          </select>

          <select name="mailStatus" defaultValue={mailStatusFilter ?? ""} className="h-10 rounded-md border px-3 text-sm">
            <option value="">Alle mail-statusser</option>
            <option value="SENT">Sendt</option>
            <option value="FAILED">Fejlet</option>
          </select>

          <select name="responseState" defaultValue={responseStateFilter ?? ""} className="h-10 rounded-md border px-3 text-sm">
            <option value="">Alle svar-statusser</option>
            <option value="ANSWERED">Besvaret</option>
            <option value="NOT_ANSWERED">Ikke besvaret</option>
          </select>

          <div className="flex gap-3">
            <button type="submit" className="h-10 flex-1 rounded-md bg-foreground px-4 text-sm font-medium text-background hover:bg-foreground/80">
              Vis udsendelser
            </button>
            {(shouldShowDetails || hasActiveFilters) && (
              <Link href="/club/outbox" className="flex h-10 items-center justify-center rounded-md border px-4 text-sm text-muted-foreground hover:bg-muted">
                Nulstil
              </Link>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="mb-1 text-base font-semibold">
          {selectedSurvey ? `Udsendelser for ${selectedSurvey.name}` : "Udsendelser"}
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">{selectedSurvey ? "Seneste 100 mails for valgt spørgeskema." : "Seneste 100 mails for klubben."}</p>

        {!shouldShowDetails ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Vælg filtre og hent listen.
          </div>
        ) : mailLogs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Ingen mails fundet med de valgte filtre.
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Tidspunkt</th>
                <th className="py-2 pr-4">Spørgeskema</th>
                <th className="py-2 pr-4">Til</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Svarstatus</th>
                <th className="py-2">Link</th>
              </tr>
            </thead>
            <tbody>
              {mailLogs.map((mailLog) => (
                <tr key={mailLog.id} className="border-b align-top">
                  <td className="py-2 pr-4 text-muted-foreground">{new Date(mailLog.sentAt).toLocaleString("da-DK")}</td>
                  <td className="py-2 pr-4">{mailLog.surveyInvitation.surveyInstance.name}</td>
                  <td className="py-2 pr-4">{mailLog.toEmail}</td>
                  <td className="py-2 pr-4">{mailLog.status === "SENT" ? "Sendt" : mailLog.status}</td>
                  <td className="py-2 pr-4">{invitationStatusLabel[mailLog.surveyInvitation.status] ?? mailLog.surveyInvitation.status}</td>
                  <td className="py-2">
                    <Link href={`/survey/${mailLog.surveyInvitation.token}`} className="text-primary underline">
                      Åbn spørgeskema-link
                    </Link>
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
