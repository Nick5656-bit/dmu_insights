import Link from "next/link";
import { MotocrossClass, RespondentAgeGroup, RespondentRole } from "@prisma/client";
import { ResultOverviewChart } from "@/components/charts/result-overview-chart";
import { loadResultOverview } from "@/lib/result-overview.server";
import { SurveyResultsPanel } from "@/components/survey-results-panel";
import { loadSurveyResults } from "@/lib/survey-results.server";
import { SUPPRESSION_THRESHOLD, responseRate } from "@/lib/survey-results";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  dashboardMotocrossClassOptions,
  dashboardRespondentAgeGroupOptions,
  dashboardRespondentRoleOptions,
} from "@/lib/survey-segments";

const dashboardLinks = [
  { href: "/club/overview", label: "Overblik" },
  { href: "/club/events", label: "Arrangementer" },
];

type ClubDashboardProps = {
  searchParams: Promise<{
    respondentAgeGroup?: string;
    motocrossClass?: string;
    respondentRole?: string;
    surveyInstanceId?: string;
    textQuestionId?: string;
  }>;
};

export default async function ClubDashboardPage({ searchParams }: ClubDashboardProps) {
  const session = await requireRole("CLUB_ADMIN");
  const params = await searchParams;

  if (!session.clubId) {
    return (
      <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Klubbens dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">Brugeren mangler klubtilknytning.</p>
      </section>
    );
  }

  const club = await prisma.club.findUnique({ where: { id: session.clubId }, select: { isTest: true } });
  if (!club) return <p role="alert">Klubben findes ikke.</p>;
  const availableSurveys = await prisma.surveyInstance.findMany({
    where: { clubId: session.clubId },
    select: {
      id: true,
      surveyTemplateId: true,
      name: true,
      status: true,
      sentAt: true,
      createdAt: true,
      _count: { select: { responses: true } },
    },
    orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
  });

  const selectedSurvey = availableSurveys.find((s) => s.id === params.surveyInstanceId);
  const selectedSurveyId = selectedSurvey?.id;
  if (params.surveyInstanceId && !selectedSurvey) {
    return <p role="alert">Spørgeskemaet findes ikke i din klub. <Link href="/club/dashboard">Nulstil filteret</Link>.</p>;
  }

  const respondentAgeGroupFilter = dashboardRespondentAgeGroupOptions.some((option) => option.value === params.respondentAgeGroup)
    ? (params.respondentAgeGroup as RespondentAgeGroup)
    : undefined;
  const motocrossClassFilter = dashboardMotocrossClassOptions.some((option) => option.value === params.motocrossClass)
    ? (params.motocrossClass as MotocrossClass)
    : undefined;
  const respondentRoleFilter = dashboardRespondentRoleOptions.some((option) => option.value === params.respondentRole)
    ? (params.respondentRole as RespondentRole)
    : undefined;

  const ownResponseWhere = {
    clubId: session.clubId,
    ...(selectedSurveyId ? { surveyInstanceId: selectedSurveyId } : {}),
    ...(respondentAgeGroupFilter ? { respondentAgeGroup: respondentAgeGroupFilter } : {}),
    ...(motocrossClassFilter ? { motocrossClass: motocrossClassFilter } : {}),
    ...(respondentRoleFilter ? { respondentRole: respondentRoleFilter } : {}),
  };

  const ownInstanceWhere = { clubId: session.clubId, ...(selectedSurveyId ? { id: selectedSurveyId } : {}) };
  const [members, surveys, ownResponsesCount, distributionRows, overviewSeries, sentInvitations, allResponsesCount] = await Promise.all([
    prisma.member.count({ where: { clubId: session.clubId, active: true } }),
    prisma.surveyInstance.count({ where: { clubId: session.clubId } }),
    prisma.surveyResponse.count({ where: ownResponseWhere }),
    loadSurveyResults(ownResponseWhere, ownInstanceWhere),
    loadResultOverview(ownResponseWhere, ownInstanceWhere),
    prisma.surveyInvitation.count({ where: { surveyInstance: ownInstanceWhere, deliveryStatus: "SENT" } }),
    prisma.surveyResponse.count({ where: { surveyInstance: ownInstanceWhere } }),
  ]);
  const canShowOwnSegment = ownResponsesCount >= SUPPRESSION_THRESHOLD;
  // Segment data is supplied only when answering, so a segment-specific invitation denominator is unknown.
  const responseCoverage = responseRate(allResponsesCount, sentInvitations);

  const summaryCards = [
    { label: "Besvarelser", value: ownResponsesCount, hint: "I valgt udsnit" },
    { label: "Medlemmer", value: members, hint: "Aktive medlemmer" },
    { label: "Svarprocent", value: responseCoverage === null ? "—" : `${responseCoverage}%`, hint: "Alle svar / sendte invitationer (uden segmentfiltre)" },
    { label: "Spørgeskemaer", value: surveys, hint: "Alle oprettede" },
  ];

  const exportParams = new URLSearchParams();
  if (selectedSurveyId) exportParams.set("surveyInstanceId", selectedSurveyId);
  if (respondentAgeGroupFilter) exportParams.set("respondentAgeGroup", respondentAgeGroupFilter);
  if (motocrossClassFilter) exportParams.set("motocrossClass", motocrossClassFilter);
  if (respondentRoleFilter) exportParams.set("respondentRole", respondentRoleFilter);
  const exportHref = `/api/exports/results${exportParams.size > 0 ? `?${exportParams.toString()}` : ""}`;

  return (
    <div className="space-y-6">
      {/* ── Filterpanel ─────────────────────────────────────────────────── */}
      <section className="overflow-visible rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-4 text-primary-foreground sm:p-6 shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)]">

        {/* Topbar: titel + kompakte handlingsknapper */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-white">Klubbens dashboard</h1>
            {club.isTest && <span className="shrink-0 rounded-lg border border-white/20 px-2 py-1 text-xs text-white/85" title="Resultaterne sammenlignes kun med andre testklubber.">Testdata</span>}
          </div>

          {/* Kompakte handlingsknapper */}
          <div className="flex flex-wrap items-center gap-2">
            {dashboardLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/18"
              >
                {link.label}
              </Link>
            ))}
            <a
              href={exportHref}
              className="rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/18"
            >
              Eksportér resultater
            </a>
          </div>
        </div>


        <form key={exportParams.toString()} className="mt-3" method="get" aria-label="Filtrér resultater">
          <div className="grid grid-cols-1 items-end gap-3 sm:max-w-xl">
          <div className="min-w-0 space-y-2">
            <label htmlFor="dashboard-survey" className="block text-xs font-medium text-white/80">Spørgeskema</label>
            <select id="dashboard-survey" name="surveyInstanceId" defaultValue={selectedSurveyId ?? ""} className="h-11 w-full min-w-0 rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground">
              <option value="">Alle spørgeskemaer</option>{availableSurveys.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          </div>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
            <details className="group min-w-0 flex-1 basis-64" open={Boolean(respondentAgeGroupFilter || motocrossClassFilter || respondentRoleFilter)}>
              <summary className="w-fit cursor-pointer rounded-lg px-2 py-3 text-sm text-white/85 hover:bg-white/10">
                Flere filtre{[respondentAgeGroupFilter, motocrossClassFilter, respondentRoleFilter].filter(Boolean).length > 0 ? ` (${[respondentAgeGroupFilter, motocrossClassFilter, respondentRoleFilter].filter(Boolean).length})` : ""}
              </summary>
              <div className="mt-1 grid grid-cols-1 gap-3 pr-2 sm:grid-cols-3">
          <div className="min-w-0 space-y-2">
            <label htmlFor="dashboard-age" className="block text-xs font-medium text-white/80">Alder</label>
            <select id="dashboard-age" name="respondentAgeGroup" defaultValue={respondentAgeGroupFilter ?? ""} className="h-11 w-full min-w-0 rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground">
              <option value="">Alle aldre</option>{dashboardRespondentAgeGroupOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="dashboard-class" className="block text-xs font-medium text-white/80">Klasse</label>
            <select id="dashboard-class" name="motocrossClass" defaultValue={motocrossClassFilter ?? ""} className="h-11 w-full min-w-0 rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground">
              <option value="">Alle klasser</option>{dashboardMotocrossClassOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="dashboard-role" className="block text-xs font-medium text-white/80">Rolle</label>
            <select id="dashboard-role" name="respondentRole" defaultValue={respondentRoleFilter ?? ""} className="h-11 w-full min-w-0 rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground">
              <option value="">Alle roller</option>{dashboardRespondentRoleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
              </div>
            </details>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/club/dashboard" className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Nulstil</Link>
            <button type="submit" className="h-11 rounded-xl bg-white px-5 text-sm font-semibold text-primary shadow-sm transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary">Anvend filtre</button>
          </div>

          </div>
        </form>
      </section>

      {/* ── Statistik-kort ───────────────────────────────────────────────── */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <article key={card.label} className="rounded-[24px] border border-border/70 bg-card p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{card.label}</p>
            <p className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground">{card.value}</p>
            <p className="mt-2 text-sm text-muted-foreground">{card.hint}</p>
          </article>
        ))}
      </section>

      {!canShowOwnSegment ? (
        <section className="rounded-[24px] border border-amber-300/80 bg-amber-50 px-5 py-4 text-sm text-amber-950 shadow-sm">
          Der er {ownResponsesCount} svar i dette udsnit. Grafer vises først ved mindst {SUPPRESSION_THRESHOLD} svar.
        </section>
      ) : null}

      <ResultOverviewChart key={exportParams.toString()} series={overviewSeries} />

      <SurveyResultsPanel results={distributionRows} textQuestionId={params.textQuestionId} />
    </div>
  );
}
