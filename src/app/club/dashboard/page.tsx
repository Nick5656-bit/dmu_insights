import Link from "next/link";
import { MotocrossClass, RespondentAgeGroup, RespondentRole } from "@prisma/client";
import { BenchmarkBarChart } from "@/components/charts/benchmark-bar-chart";
import { SurveyResultsPanel } from "@/components/survey-results-panel";
import { loadSurveyResults } from "@/lib/survey-results.server";
import { SUPPRESSION_THRESHOLD, buildQuestionBenchmarks, responseRate, surveyYearWhere } from "@/lib/survey-results";
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
  const comparisonYear = (selectedSurvey?.sentAt ?? selectedSurvey?.createdAt)?.getUTCFullYear();
  const comparisonInstanceWhere = selectedSurvey && comparisonYear
    ? { club: { isTest: club.isTest }, clubId: { not: session.clubId }, surveyTemplateId: selectedSurvey.surveyTemplateId, ...surveyYearWhere(comparisonYear) }
    : null;
  const [members, surveys, ownResponsesCount, distributionRows, comparisonResults, sentInvitations, allResponsesCount] = await Promise.all([
    prisma.member.count({ where: { clubId: session.clubId, active: true } }),
    prisma.surveyInstance.count({ where: { clubId: session.clubId } }),
    prisma.surveyResponse.count({ where: ownResponseWhere }),
    loadSurveyResults(ownResponseWhere, ownInstanceWhere),
    comparisonInstanceWhere ? loadSurveyResults({
      surveyInstance: comparisonInstanceWhere,
      ...(respondentAgeGroupFilter ? { respondentAgeGroup: respondentAgeGroupFilter } : {}),
      ...(motocrossClassFilter ? { motocrossClass: motocrossClassFilter } : {}),
      ...(respondentRoleFilter ? { respondentRole: respondentRoleFilter } : {}),
    }, comparisonInstanceWhere) : Promise.resolve([]),
    prisma.surveyInvitation.count({ where: { surveyInstance: ownInstanceWhere, deliveryStatus: "SENT" } }),
    prisma.surveyResponse.count({ where: { surveyInstance: ownInstanceWhere } }),
  ]);
  const canShowOwnSegment = ownResponsesCount >= SUPPRESSION_THRESHOLD;
  const benchmarkRows = buildQuestionBenchmarks(distributionRows, comparisonResults);
  const overallOwn = benchmarkRows.length ? benchmarkRows.reduce((sum, row) => sum + row.own, 0) / benchmarkRows.length : null;
  const overallBenchmark = benchmarkRows.length ? benchmarkRows.reduce((sum, row) => sum + row.benchmark, 0) / benchmarkRows.length : null;
  const delta = overallOwn !== null && overallBenchmark !== null ? overallOwn - overallBenchmark : null;
  // Segment data is supplied only when answering, so a segment-specific invitation denominator is unknown.
  const responseCoverage = responseRate(allResponsesCount, sentInvitations);

  const activeFilters = [
    selectedSurvey ? `Spørgeskema: ${selectedSurvey.name}` : undefined,
    respondentAgeGroupFilter ? `Alder: ${dashboardRespondentAgeGroupOptions.find((option) => option.value === respondentAgeGroupFilter)?.label}` : undefined,
    motocrossClassFilter ? `Motocrossklasse: ${dashboardMotocrossClassOptions.find((option) => option.value === motocrossClassFilter)?.label}` : undefined,
    respondentRoleFilter ? `Rolle: ${dashboardRespondentRoleOptions.find((option) => option.value === respondentRoleFilter)?.label}` : undefined,
  ].filter(Boolean) as string[];

  const summaryCards = [
    { label: "Besvarelser", value: ownResponsesCount, hint: "I valgt udsnit" },
    { label: "Medlemmer", value: members, hint: "Aktive medlemmer" },
    { label: "Svarprocent", value: responseCoverage === null ? "—" : `${responseCoverage}%`, hint: "Alle svar / sendte invitationer (uden segmentfiltre)" },
    { label: "Spørgeskemaer", value: surveys, hint: "Alle oprettede" },
  ];

  const canRenderBenchmark = benchmarkRows.length > 0;
  const exportParams = new URLSearchParams();
  if (selectedSurveyId) exportParams.set("surveyInstanceId", selectedSurveyId);
  if (respondentAgeGroupFilter) exportParams.set("respondentAgeGroup", respondentAgeGroupFilter);
  if (motocrossClassFilter) exportParams.set("motocrossClass", motocrossClassFilter);
  if (respondentRoleFilter) exportParams.set("respondentRole", respondentRoleFilter);
  const exportHref = `/api/exports/results${exportParams.size > 0 ? `?${exportParams.toString()}` : ""}`;

  return (
    <div className="space-y-6">
      {club.isTest ? <p role="status" className="rounded-2xl border bg-muted/20 p-4 text-sm">Testklub: Disse resultater er testdata og sammenlignes kun med andre testklubber.</p> : null}
      {/* ── Filterpanel ─────────────────────────────────────────────────── */}
      <section className="overflow-visible rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)]">

        {/* Topbar: titel + kompakte handlingsknapper */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/90">
              Indsigter
            </span>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-white">Klubbens dashboard</h1>
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

        {/* Aktive filter-pills – kun synlige når filtre er valgt */}
        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {activeFilters.map((pill) => (
              <span key={pill} className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/85">
                {pill}
              </span>
            ))}
          </div>
        )}

        {/* Filterrækken */}
        <form className="mt-4 grid gap-2 rounded-[24px] border border-white/12 bg-white/8 p-3 backdrop-blur-sm md:grid-cols-2 xl:grid-cols-6" method="get">
          {/* Spørgeskema */}
          <div className="relative md:col-span-2">
            <select name="surveyInstanceId" defaultValue={selectedSurveyId ?? ""}
              className="h-11 w-full appearance-none rounded-2xl border border-border/70 bg-background/95 pl-3 pr-8 text-sm text-foreground">
              <option value="">Alle spørgeskemaer</option>
              {availableSurveys.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s._count.responses} svar)</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">▾</span>
          </div>

          {/* Alder */}
          <div className="relative md:col-span-1">
            <select name="respondentAgeGroup" defaultValue={respondentAgeGroupFilter ?? ""}
              className="h-11 w-full appearance-none rounded-2xl border border-border/70 bg-background/95 pl-3 pr-8 text-sm text-foreground">
              <option value="">Alle aldre</option>
              {dashboardRespondentAgeGroupOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">▾</span>
          </div>

          {/* Klasse */}
          <div className="relative md:col-span-1">
            <select name="motocrossClass" defaultValue={motocrossClassFilter ?? ""}
              className="h-11 w-full appearance-none rounded-2xl border border-border/70 bg-background/95 pl-3 pr-8 text-sm text-foreground">
              <option value="">Alle klasser</option>
              {dashboardMotocrossClassOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">▾</span>
          </div>

          {/* Rolle */}
          <div className="relative md:col-span-1">
            <select name="respondentRole" defaultValue={respondentRoleFilter ?? ""}
              className="h-11 w-full appearance-none rounded-2xl border border-border/70 bg-background/95 pl-3 pr-8 text-sm text-foreground">
              <option value="">Alle roller</option>
              {dashboardRespondentRoleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">▾</span>
          </div>

          <div className="flex gap-2 md:col-span-1">
            <button type="submit" className="h-11 flex-1 rounded-2xl bg-white px-4 text-sm font-semibold text-primary shadow-sm transition hover:-translate-y-0.5 hover:bg-white/92">
              Opdater
            </button>
            <Link href="/club/dashboard" className="flex h-11 items-center justify-center rounded-2xl border border-white/15 px-4 text-sm font-medium text-white/85 transition hover:bg-white/10">
              Nulstil
            </Link>
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

      {/* ── Benchmark + sidepanel ────────────────────────────────────────── */}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_360px]">
        <article className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Benchmark</h2>
              <p className="mt-1 text-sm text-muted-foreground">Jeres gennemsnit pr. spørgsmål mod andre klubber med samme skabelon og udsendelsesår. Begge grupper skal have mindst fem svar pr. spørgsmål.</p>
            </div>
            <span className="rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground">
              {benchmarkRows.length} spørgsmål
            </span>
          </div>
          <div className="mt-5 rounded-[22px] border border-border/60 bg-background/80 p-4">
            {canRenderBenchmark ? (
              <BenchmarkBarChart data={benchmarkRows} />
            ) : (
              <div className="rounded-[20px] border border-dashed border-border/70 bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground">
                {selectedSurvey ? "Der er endnu ikke nok svar til en sammenligning." : "Vælg et spørgeskema for at sammenligne samme skabelon og udsendelsesår."}
              </div>
            )}
          </div>
        </article>

        <article className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
          <div className="space-y-3">
            <div className="rounded-[22px] border border-border/70 bg-background/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Samlet niveau</p>
              <p className="mt-2 font-heading text-3xl font-semibold tracking-tight text-foreground">
                {overallOwn !== null ? overallOwn.toFixed(2) : "–"}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-[22px] border border-border/70 bg-background/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Benchmark</p>
                <p className="mt-2 font-heading text-3xl font-semibold tracking-tight text-foreground">
                  {overallBenchmark !== null ? overallBenchmark.toFixed(2) : "–"}
                </p>
              </div>
              <div className="rounded-[22px] border border-border/70 bg-background/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Forskel</p>
                <p className="mt-2 font-heading text-3xl font-semibold tracking-tight text-foreground">
                  {delta !== null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}` : "–"}
                </p>
              </div>
            </div>
            <div className="rounded-[22px] border border-border/70 bg-background/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Egne svar i udsnittet</p>
                <span className="text-sm font-semibold text-foreground">{ownResponsesCount}</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Svarprocent uden segmentfiltre</p>
                <span className="text-sm font-semibold text-foreground">{responseCoverage === null ? "—" : `${responseCoverage}%`}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${responseCoverage ?? 0}%` }} />
              </div>
            </div>
          </div>
        </article>
      </section>

      <SurveyResultsPanel results={distributionRows} textQuestionId={params.textQuestionId} />
    </div>
  );
}
