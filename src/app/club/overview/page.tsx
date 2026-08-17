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

export default async function ClubOverviewPage() {
  const session = await requireRole("CLUB_ADMIN");

  if (!session.clubId) {
    return (
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">Kluboverblik</h2>
        <p className="mt-2 text-sm text-muted-foreground">Brugeren mangler klubtilknytning.</p>
      </section>
    );
  }

  const [members, surveys, responses, pendingSendCount, missingReadyEventSurveys, recentSentSurveys] = await Promise.all([
    prisma.member.count({ where: { clubId: session.clubId, active: true } }),
    prisma.surveyInstance.count({ where: { clubId: session.clubId } }),
    prisma.surveyResponse.count({ where: { clubId: session.clubId } }),
    prisma.scheduledSend.count({
      where: {
        status: "PENDING",
        surveyInstance: {
          clubId: session.clubId,
        },
      },
    }),
    prisma.surveyInstance.findMany({
      where: {
        clubId: session.clubId,
        surveyType: "EVENT",
        clubReadyAt: null,
        status: { in: ["DRAFT", "SCHEDULED"] },
        scheduledSends: {
          some: {
            status: "PENDING",
          },
        },
      },
      select: {
        id: true,
        name: true,
        event: {
          select: {
            title: true,
            eventDate: true,
          },
        },
        scheduledSends: {
          where: { status: "PENDING" },
          orderBy: { sendAt: "asc" },
          take: 1,
          select: { sendAt: true },
        },
      },
      orderBy: {
        event: {
          eventDate: "asc",
        },
      },
      take: 5,
    }),
    prisma.surveyInstance.findMany({
      where: {
        clubId: session.clubId,
        sentAt: { not: null },
      },
      select: {
        id: true,
        name: true,
        status: true,
        surveyType: true,
        sentAt: true,
        _count: {
          select: {
            invitations: true,
            responses: true,
          },
        },
      },
      orderBy: [{ sentAt: "desc" }, { updatedAt: "desc" }],
      take: 6,
    }),
  ]);

  const missingReadyCount = missingReadyEventSurveys.length;
  const responseCoverage = members > 0 ? Math.min((responses / members) * 100, 100) : 0;

  const summaryCards = [
    { label: "Spørgeskemaer", value: surveys },
    { label: "Besvarelser", value: responses },
    { label: "Udsendelser", value: pendingSendCount },
    { label: "Klarmelding", value: missingReadyCount },
  ];

  const recentSurveyRows = recentSentSurveys.map((survey) => {
    const invitationCount = survey._count.invitations;
    const responseCount = survey._count.responses;
    const responseRate = invitationCount > 0 ? Math.round((responseCount / invitationCount) * 100) : 0;

    return {
      id: survey.id,
      name: survey.name,
      typeLabel: survey.surveyType === "EVENT" ? "Event" : "Årlig",
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-foreground/70">Klubadministrator</p>
            <h2 className="mt-3 text-4xl font-bold tracking-[-0.05em]">Overblik</h2>
            <p className="mt-3 max-w-2xl text-sm text-primary-foreground/75">Klubbens status og seneste aktivitet.</p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/club/events" className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-primary transition hover:bg-white/92">
                Arrangementer
              </Link>
              <Link href="/club/dashboard" className="rounded-full border border-white/16 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8">
                Indsigter
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground/66">Medlemmer</p>
              <p className="mt-3 text-4xl font-bold">{members}</p>
            </article>
            <article className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground/66">Dækning</p>
              <p className="mt-3 text-4xl font-bold">{responseCoverage.toFixed(0)}%</p>
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

      {missingReadyCount > 0 ? (
        <section className="rounded-[1.8rem] border border-amber-300 bg-amber-50 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">Kræver opfølgning</p>
              <h3 className="mt-2 text-2xl font-bold text-amber-950">Mangler klarmelding</h3>
              <p className="mt-1 text-sm text-amber-900">{missingReadyCount} arrangementer venter.</p>
            </div>
            <Link href="/club/events" className="rounded-full border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100">
              Arrangementer
            </Link>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {missingReadyEventSurveys.map((survey) => {
              const eventDate = survey.event?.eventDate ? formatDate(survey.event.eventDate) : "Ukendt dato";
              const sendDate = survey.scheduledSends[0]?.sendAt ? formatDate(survey.scheduledSends[0].sendAt) : "Ukendt";

              return (
                <article key={survey.id} className="rounded-[1.3rem] border border-amber-200 bg-white p-4">
                  <p className="text-sm font-semibold text-amber-950">{survey.event?.title ?? survey.name}</p>
                  <p className="mt-1 text-xs text-amber-800">Event: {eventDate}</p>
                  <p className="text-xs text-amber-800">Send: {sendDate}</p>
                  <div className="mt-3">
                    <Link href="/club/events" className="rounded-full border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100">
                      Se arrangementer
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded-[1.8rem] border bg-background p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Senest sendt</p>
            <h3 className="mt-2 text-2xl font-bold">Senest afsendte spørgeskemaer</h3>
            <p className="mt-1 text-sm text-muted-foreground">Klubbens seneste udsendelser.</p>
          </div>
          <Link href="/club/events" className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-95">
            Se arrangementer
          </Link>
        </div>

        {recentSurveyRows.length > 0 ? (
          <div className="mt-5 overflow-hidden rounded-[1.4rem] border">
            <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b bg-muted/25 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground md:grid">
              <span>Spørgeskema</span>
              <span>Type</span>
              <span>Sendt</span>
              <span>Svar</span>
              <span>Status</span>
            </div>

            <div className="divide-y">
              {recentSurveyRows.map((survey) => (
                <article key={survey.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,2.2fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{survey.name}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{survey.typeLabel}</p>
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
