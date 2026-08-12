import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function formatDate(value: Date | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

export default async function DmuOverviewPage() {
  await requireRole("DMU_ADMIN");
  const now = new Date();

  const [
    clubCount,
    memberCount,
    surveyCount,
    eventCount,
    pendingSendCount,
    templateCount,
    pendingEventSurveys,
    readyToProcessCount,
    overdueNotReadyCount,
    recentSentSurveys,
  ] = await Promise.all([
    prisma.club.count({ where: { active: true } }),
    prisma.member.count({ where: { active: true } }),
    prisma.surveyInstance.count(),
    prisma.event.count(),
    prisma.scheduledSend.count({ where: { status: "PENDING" } }),
    prisma.surveyTemplate.count({ where: { isActive: true } }),
    prisma.surveyInstance.findMany({
      where: {
        surveyType: "EVENT",
        status: { in: ["DRAFT", "SCHEDULED"] },
        scheduledSends: {
          some: { status: "PENDING" },
        },
      },
      select: {
        clubId: true,
        clubReadyAt: true,
        club: {
          select: {
            name: true,
          },
        },
        scheduledSends: {
          where: { status: "PENDING" },
          orderBy: { sendAt: "asc" },
          take: 1,
          select: { sendAt: true },
        },
      },
      take: 200,
    }),
    prisma.scheduledSend.count({
      where: {
        status: "PENDING",
        sendAt: { lte: now },
        surveyInstance: {
          OR: [{ surveyType: { not: "EVENT" } }, { clubReadyAt: { not: null } }],
        },
      },
    }),
    prisma.scheduledSend.count({
      where: {
        status: "PENDING",
        sendAt: { lte: now },
        surveyInstance: {
          surveyType: "EVENT",
          clubReadyAt: null,
        },
      },
    }),
    prisma.surveyInstance.findMany({
      where: {
        sentAt: { not: null },
      },
      include: {
        club: {
          select: {
            name: true,
          },
        },
        invitations: {
          select: {
            id: true,
          },
        },
        responses: {
          select: {
            id: true,
          },
        },
      },
      orderBy: [{ sentAt: "desc" }, { updatedAt: "desc" }],
      take: 6,
    }),
  ]);

  const missingReadySurveys = pendingEventSurveys
    .filter((survey) => !survey.clubReadyAt)
    .sort((left, right) => {
      const leftSendAt = left.scheduledSends[0]?.sendAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightSendAt = right.scheduledSends[0]?.sendAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftSendAt - rightSendAt;
    });

  const missingReadyByClub = new Map<string, { clubName: string; count: number; nearestSendAt: Date | null }>();
  for (const survey of missingReadySurveys) {
    const existing = missingReadyByClub.get(survey.clubId);
    const sendAt = survey.scheduledSends[0]?.sendAt ?? null;

    if (!existing) {
      missingReadyByClub.set(survey.clubId, {
        clubName: survey.club.name,
        count: 1,
        nearestSendAt: sendAt,
      });
      continue;
    }

    const nearestSendAt =
      existing.nearestSendAt && sendAt
        ? existing.nearestSendAt.getTime() < sendAt.getTime()
          ? existing.nearestSendAt
          : sendAt
        : existing.nearestSendAt ?? sendAt;

    missingReadyByClub.set(survey.clubId, {
      clubName: existing.clubName,
      count: existing.count + 1,
      nearestSendAt,
    });
  }

  const clubsMissingReadyCount = missingReadyByClub.size;
  const topClubsMissingReady = Array.from(missingReadyByClub.values())
    .sort((left, right) => {
      const leftTs = left.nearestSendAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightTs = right.nearestSendAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (leftTs !== rightTs) {
        return leftTs - rightTs;
      }
      return right.count - left.count;
    })
    .slice(0, 5);

  const summaryCards = [
    { label: "Spørgeskemaer", value: surveyCount },
    { label: "Arrangementer", value: eventCount },
    { label: "Udsendelser", value: pendingSendCount },
    { label: "Skabeloner", value: templateCount },
  ];

  const recentSurveyRows = recentSentSurveys.map((survey) => {
    const invitationCount = survey.invitations.length;
    const responseCount = survey.responses.length;
    const responseRate = invitationCount > 0 ? Math.round((responseCount / invitationCount) * 100) : 0;

    return {
      id: survey.id,
      name: survey.name,
      clubName: survey.club.name,
      sentAt: survey.sentAt,
      responseCount,
      responseRate,
      statusLabel: survey.status === "CLOSED" ? "Lukket" : "Aktiv",
      statusTone:
        survey.status === "CLOSED"
          ? "bg-slate-100 text-slate-700"
          : survey.status === "SENT"
            ? "bg-emerald-100 text-emerald-800"
            : "bg-muted text-muted-foreground",
    };
  });

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[1.9rem] border bg-[linear-gradient(135deg,rgba(16,36,77,0.98),rgba(33,64,122,0.92))] p-6 text-primary-foreground shadow-[0_30px_60px_-42px_rgba(21,37,77,0.8)]">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-foreground/70">DMU administrator</p>
            <h2 className="mt-3 text-4xl font-bold tracking-[-0.05em]">Overblik</h2>
            <p className="mt-3 max-w-2xl text-sm text-primary-foreground/75">Drift, status og næste skridt.</p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/dmu/dashboard" className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-primary transition hover:bg-white/92">
                Analyse
              </Link>
              <Link href="/dmu/events" className="rounded-full border border-white/16 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8">
                Drift
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground/66">Klubber</p>
              <p className="mt-3 text-4xl font-bold">{clubCount}</p>
            </article>
            <article className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground/66">Medlemmer</p>
              <p className="mt-3 text-4xl font-bold">{memberCount}</p>
            </article>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <article key={card.label} className="rounded-xl border bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{card.label}</p>
            <p className="mt-3 text-3xl font-bold">{card.value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[1.8rem] border bg-background p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Drift</p>
            <h3 className="mt-2 text-2xl font-bold">Klarmelding og udsendelser</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dmu/events" className="rounded-full border px-4 py-2.5 text-sm font-semibold hover:bg-muted">
              Arrangementer
            </Link>
            <Link href="/dmu/outbox" className="rounded-full border px-4 py-2.5 text-sm font-semibold hover:bg-muted">
              Udsendelser
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <article className="rounded-[1.5rem] border bg-muted/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Klar nu</p>
            <p className="mt-3 text-4xl font-bold">{readyToProcessCount}</p>
          </article>
          <article className="rounded-[1.5rem] border bg-muted/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Mangler klarmelding</p>
            <p className="mt-3 text-4xl font-bold">{clubsMissingReadyCount}</p>
          </article>
          <article className="rounded-[1.5rem] border bg-muted/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Overskredet</p>
            <p className={`mt-3 text-4xl font-bold ${overdueNotReadyCount > 0 ? "text-amber-700" : ""}`}>{overdueNotReadyCount}</p>
          </article>
        </div>

        {clubsMissingReadyCount > 0 ? (
          <div className="mt-5 rounded-[1.6rem] border border-amber-300 bg-amber-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">Kræver opfølgning</p>
            <p className="mt-2 text-base font-semibold text-amber-950">
              {clubsMissingReadyCount} klub{clubsMissingReadyCount > 1 ? "ber" : ""} mangler klarmelding.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {topClubsMissingReady.map((club) => (
                <article key={club.clubName} className="rounded-[1.2rem] border border-amber-200 bg-white p-4">
                  <p className="text-sm font-semibold text-amber-950">{club.clubName}</p>
                  <p className="mt-2 text-xs text-amber-800">Mangler: {club.count}</p>
                  <p className="text-xs text-amber-800">Næste send: {formatDate(club.nearestSendAt)}</p>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-[1.6rem] border border-emerald-300 bg-emerald-50 p-5">
            <p className="text-sm font-semibold text-emerald-900">Alt ser klart ud.</p>
          </div>
        )}
      </section>

      <section className="rounded-[1.8rem] border bg-background p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Senest sendt</p>
            <h3 className="mt-2 text-2xl font-bold">Senest afsendte spørgeskemaer</h3>
            <p className="mt-1 text-sm text-muted-foreground">Seneste aktivitet i udsendelser.</p>
          </div>
          <Link href="/dmu/surveys" className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-95">
            Åbn spørgeskemaer
          </Link>
        </div>

        {recentSurveyRows.length > 0 ? (
          <div className="mt-5 overflow-hidden rounded-[1.4rem] border">
            <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b bg-muted/25 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground md:grid">
              <span>Spørgeskema</span>
              <span>Klub</span>
              <span>Sendt</span>
              <span>Svar</span>
              <span>Status</span>
            </div>

            <div className="divide-y">
              {recentSurveyRows.map((survey) => (
                <article key={survey.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{survey.name}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{survey.clubName}</p>
                  <p className="text-sm text-muted-foreground">{formatDate(survey.sentAt)}</p>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-[linear-gradient(90deg,#76d6d5,#2f5a9a)]" style={{ width: `${Math.max(8, survey.responseRate)}%` }} />
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {survey.responseCount} ({survey.responseRate}%)
                    </span>
                  </div>
                  <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${survey.statusTone}`}>{survey.statusLabel}</span>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-[1.4rem] border border-dashed p-6 text-sm text-muted-foreground">Ingen afsendte spørgeskemaer endnu.</div>
        )}
      </section>
    </div>
  );
}
