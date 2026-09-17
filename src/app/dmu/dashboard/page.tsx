import Link from "next/link";
import { MotocrossClass, RespondentAgeGroup, RespondentRole } from "@prisma/client";
import { ClubComparisonChart } from "@/components/charts/benchmark-bar-chart";
import { SurveyResultsPanel } from "@/components/survey-results-panel";
import { loadSurveyResults } from "@/lib/survey-results.server";
import { SUPPRESSION_THRESHOLD, surveyYearWhere } from "@/lib/survey-results";
import { ClubMultiSelectFilter } from "@/components/club-multi-select-filter";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  dashboardMotocrossClassOptions,
  dashboardRespondentAgeGroupOptions,
  dashboardRespondentRoleOptions,
} from "@/lib/survey-segments";


const surveyActionLinks = [
  { href: "/dmu/send", label: "Udsend spørgeskema" },
  { href: "/dmu/calendar", label: "Kalender" },
];

type DmuDashboardProps = {
  searchParams: Promise<{
    respondentAgeGroup?: string;
    motocrossClass?: string;
    respondentRole?: string;
    surveyTemplateId?: string;
    clubIds?: string | string[];
    textQuestionId?: string;
    year?: string;
    dataMode?: string;
  }>;
};

function parseClubIds(rawValue: string | string[] | undefined): string[] {
  if (!rawValue) {
    return [];
  }

  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  return [...new Set(values.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean))];
}

export default async function DmuDashboardPage({ searchParams }: DmuDashboardProps) {
  await requireRole("DMU_ADMIN");
  const params = await searchParams;
  const isTest = params.dataMode === "test";
  const dataScope = { club: { isTest } };
  const currentYear = new Date().getUTCFullYear();
  const selectedYear = params.year === "all" ? null : /^\d{4}$/.test(params.year ?? "") ? Number(params.year) : currentYear;
  const yearWhere = selectedYear ? surveyYearWhere(selectedYear) : {};

  const clubs = await prisma.club.findMany({ where: { active: true, isTest }, orderBy: { name: "asc" } });

  const selectedClubIds = parseClubIds(params.clubIds);
  const selectedClubs = clubs.filter((club) => selectedClubIds.includes(club.id));

  const availableTemplates = await prisma.surveyTemplate.findMany({
    where: {
      surveyInstances: {
        some: {
          ...dataScope,
          ...(selectedClubIds.length > 0 ? { clubId: { in: selectedClubIds } } : {}),
        },
      },
    },
    select: {
      id: true,
      name: true,
      surveyType: true,
      _count: {
        select: {
          surveyInstances: { where: dataScope },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const selectedTemplate = availableTemplates.find((template) => template.id === params.surveyTemplateId);
  const selectedTemplateInstanceIds = selectedTemplate
    ? (
        await prisma.surveyInstance.findMany({
          where: {
            surveyTemplateId: selectedTemplate.id,
            ...dataScope,
            ...(selectedClubIds.length > 0 ? { clubId: { in: selectedClubIds } } : {}),
          },
          select: { id: true },
        })
      ).map((instance) => instance.id)
    : [];

  const respondentAgeGroupFilter = dashboardRespondentAgeGroupOptions.some((option) => option.value === params.respondentAgeGroup)
    ? (params.respondentAgeGroup as RespondentAgeGroup)
    : undefined;
  const motocrossClassFilter = dashboardMotocrossClassOptions.some((option) => option.value === params.motocrossClass)
    ? (params.motocrossClass as MotocrossClass)
    : undefined;
  const respondentRoleFilter = dashboardRespondentRoleOptions.some((option) => option.value === params.respondentRole)
    ? (params.respondentRole as RespondentRole)
    : undefined;

  const activeFilters = [
    isTest ? "Testdata" : "Pilotdata",
    ...(selectedTemplate ? [`Skabelon: ${selectedTemplate.name}`] : []),
    ...(selectedClubs.length > 0 ? [`Klubber: ${selectedClubs.length}`] : []),
    ...(respondentAgeGroupFilter
      ? [`Alder: ${dashboardRespondentAgeGroupOptions.find((option) => option.value === respondentAgeGroupFilter)?.label ?? respondentAgeGroupFilter}`]
      : []),
    ...(motocrossClassFilter
      ? [`Motocrossklasse: ${dashboardMotocrossClassOptions.find((option) => option.value === motocrossClassFilter)?.label ?? motocrossClassFilter}`]
      : []),
    ...(respondentRoleFilter
      ? [`Rolle: ${dashboardRespondentRoleOptions.find((option) => option.value === respondentRoleFilter)?.label ?? respondentRoleFilter}`]
      : []),
  ];

  const exportParams = new URLSearchParams();
  exportParams.set("dataMode", isTest ? "test" : "pilot");
  exportParams.set("year", selectedYear ? String(selectedYear) : "all");
  if (selectedClubIds.length > 0) exportParams.set("clubIds", selectedClubIds.join(","));
  if (selectedTemplate) exportParams.set("surveyTemplateId", selectedTemplate.id);
  if (respondentAgeGroupFilter) exportParams.set("respondentAgeGroup", respondentAgeGroupFilter);
  if (motocrossClassFilter) exportParams.set("motocrossClass", motocrossClassFilter);
  if (respondentRoleFilter) exportParams.set("respondentRole", respondentRoleFilter);
  const exportHref = `/api/exports/results${exportParams.size > 0 ? `?${exportParams.toString()}` : ""}`;

  const instanceWhere = {
    ...dataScope,
    ...yearWhere,
    ...(selectedTemplate ? { surveyTemplateId: selectedTemplate.id } : {}),
    ...(selectedClubIds.length > 0 ? { clubId: { in: selectedClubIds } } : {}),
  };
  const responseWhere = {
    surveyInstance: instanceWhere,
    ...(selectedTemplate ? { surveyInstanceId: { in: selectedTemplateInstanceIds } } : {}),
    ...(selectedClubIds.length > 0 ? { clubId: { in: selectedClubIds } } : {}),
    ...(respondentAgeGroupFilter ? { respondentAgeGroup: respondentAgeGroupFilter } : {}),
    ...(motocrossClassFilter ? { motocrossClass: motocrossClassFilter } : {}),
    ...(respondentRoleFilter ? { respondentRole: respondentRoleFilter } : {}),
  };

  const [totalResponses, results] = await Promise.all([
    prisma.surveyResponse.count({ where: responseWhere }),
    loadSurveyResults(responseWhere, instanceWhere),
  ]);

  const clubsInScope = selectedClubs.length > 0 ? selectedClubs : clubs;
  const keyQuestion = results.find((result) => result.benchmarkKey === "SATISFACTION_OVERALL" && !result.suppressed)
    ?? results.find((result) => result.questionType === "SCALE_1_5" && result.benchmarkKey && !result.suppressed);
  const clubComparisonRows: { label: string; own: number; benchmark: number }[] = [];
  const shouldShowClubComparison = selectedClubs.length >= 2 && Boolean(selectedTemplate && selectedYear);
  if (shouldShowClubComparison && keyQuestion && selectedTemplate) {
    const comparisonInstanceWhere = { ...dataScope, ...yearWhere, surveyTemplateId: selectedTemplate.id };
    // The national benchmark includes only clubs that independently meet the
    // minimum for this question. A small club cannot be recovered by subtraction.
    const clubResults = await Promise.all(clubs.map(async (club) => {
      const perClubWhere = { ...comparisonInstanceWhere, clubId: club.id };
      const perClub = await loadSurveyResults({
        ...responseWhere, clubId: club.id, surveyInstanceId: undefined,
        surveyInstance: perClubWhere,
      }, perClubWhere);
      return { club, result: perClub.find((result) => result.questionId === keyQuestion.questionId) };
    }));
    const eligible = clubResults.filter(({ result }) => result && !result.suppressed && result.avg !== null);
    const count = eligible.reduce((sum, { result }) => sum + result!.count, 0);
    const benchmark = count ? eligible.reduce((sum, { result }) => sum + result!.avg! * result!.count, 0) / count : null;
    if (benchmark !== null) {
      for (const { club, result } of eligible) {
        if (selectedClubIds.includes(club.id)) clubComparisonRows.push({ label: club.name, own: result!.avg!, benchmark: Number(benchmark.toFixed(2)) });
      }
    }
  }

  const summaryCards = [
    { label: "Besvarelser", value: totalResponses, hint: "I valgt udsnit" },
    { label: "Klubber", value: clubsInScope.length, hint: selectedClubs.length > 0 ? "Udvalgte klubber" : "Aktive klubber" },
    { label: "Spørgsmål", value: results.length, hint: "Skala, valgmuligheder og tekst" },
    { label: "Filtre", value: activeFilters.length + (selectedYear ? 1 : 0), hint: activeFilters.length > 0 || selectedYear ? "Aktive" : "Ingen valgt" },
  ];

  return (
    <div className="space-y-6">
      {/* ── Filterpanel ─────────────────────────────────────────────────── */}
      <section className="overflow-visible rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-4 text-primary-foreground sm:p-6 shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)]">

        {/* Topbar: titel + kompakte handlingsknapper */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-white">National analyse</h1>
          </div>

          {/* Kompakte handlingsknapper */}
          <div className="flex flex-wrap items-center gap-2">
            {surveyActionLinks.map((link) => (
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

        <nav aria-label="Datagrundlag" className="mt-5 inline-flex gap-1 rounded-xl border border-white/15 bg-black/10 p-1">
          {(["pilot", "test"] as const).map((mode) => <Link key={mode} href={`/dmu/dashboard?dataMode=${mode}`} aria-current={(isTest ? "test" : "pilot") === mode ? "page" : undefined} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${(isTest ? "test" : "pilot") === mode ? "bg-white text-primary shadow-sm" : "text-white/75 hover:bg-white/10 hover:text-white"}`}>{mode === "pilot" ? "Pilotdata" : "Testdata"}</Link>)}
        </nav>
        <form key={exportParams.toString()} className="mt-5 border-t border-white/15 pt-5" method="get" aria-label="Filtrér resultater">
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <input type="hidden" name="dataMode" value={isTest ? "test" : "pilot"} />
          <div className="min-w-0 space-y-2">
            <label htmlFor="dashboard-clubs" className="block text-xs font-medium text-white/80">Klubber</label>
            <ClubMultiSelectFilter key={`${isTest}-${selectedClubIds.join(",")}`} id="dashboard-clubs" clubs={clubs} initialSelectedIds={selectedClubIds} />
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="dashboard-template" className="block text-xs font-medium text-white/80">Skabelon</label>
            <select id="dashboard-template" name="surveyTemplateId" defaultValue={selectedTemplate?.id ?? ""} className="h-11 w-full min-w-0 rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground">
              <option value="">Alle skabeloner</option>{availableTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="dashboard-year" className="block text-xs font-medium text-white/80">År</label>
            <select id="dashboard-year" name="year" defaultValue={selectedYear ?? "all"} className="h-11 w-full min-w-0 rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground">
              <option value="all">Alle år</option>{[...new Set([currentYear, currentYear - 1, currentYear - 2, currentYear - 3, ...(selectedYear ? [selectedYear] : [])])].sort((a, b) => b - a).map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
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
          <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-white/15 pt-4">
            <Link href={`/dmu/dashboard?dataMode=${isTest ? "test" : "pilot"}`} className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Nulstil</Link>
            <button type="submit" className="h-11 rounded-xl bg-white px-5 text-sm font-semibold text-primary shadow-sm transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary">Anvend filtre</button>
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

      {/* ── Klubsammenligning ───────────────────────────────────────────── */}
      <section>
        <article className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Klubsammenligning</h2>
              <p className="mt-1 text-sm text-muted-foreground">{keyQuestion ? `${keyQuestion.questionTitle} · Samme skabelon og udsendelsesår. Benchmark omfatter klubber med mindst fem svar på spørgsmålet.` : "Vælg en skabelon med skalaspørgsmål til sammenligning."}</p>
            </div>
            <span className="rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground">Skala 1-5</span>
          </div>

          <div className="mt-5 rounded-[22px] border border-border/60 bg-background/80 p-4">
            {shouldShowClubComparison && clubComparisonRows.length > 0 ? (
              <ClubComparisonChart data={clubComparisonRows} />
            ) : (
              <div className="rounded-[20px] border border-dashed border-border/70 bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Ingen resultater endnu</p>
                <p className="mt-1">
                  {!shouldShowClubComparison
                    ? "Vælg mindst to klubber, en skabelon og et år for at sammenligne deres resultater."
                    : `Sammenligning vises, når hver klub har mindst ${SUPPRESSION_THRESHOLD} svar på det samme spørgsmål.`}
                </p>
              </div>
            )}
          </div>
        </article>
      </section>

      <SurveyResultsPanel results={results} textQuestionId={params.textQuestionId} />
    </div>
  );
}
