import Link from "next/link";
import { MobileFilterPanel } from "@/components/mobile-filter-panel";
import { parseSelectionIds, parseDashboardYear } from "@/lib/dashboard-filters";
import { overviewQuestions } from "@/lib/result-overview";
import { MotocrossClass, RespondentAgeGroup, RespondentRole } from "@prisma/client";
import { ResultOverviewChart } from "@/components/charts/result-overview-chart";
import { loadResultOverview } from "@/lib/result-overview.server";
import { SurveyResultsPanel } from "@/components/survey-results-panel";
import { loadSurveyResults } from "@/lib/survey-results.server";
import { surveyYearWhere } from "@/lib/survey-results";
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
    surveyInstanceId?: string | string[];
    clubIds?: string | string[];
    textQuestionId?: string;
    year?: string;
    dataMode?: string;
  }>;
};

export default async function DmuDashboardPage({ searchParams }: DmuDashboardProps) {
  await requireRole("DMU_ADMIN");
  const params = await searchParams;
  const isTest = params.dataMode === "test";
  const dataScope = { club: { isTest } };
  const currentYear = new Date().getUTCFullYear();
  const selectedYear = parseDashboardYear(params.year);
  const yearWhere = selectedYear ? surveyYearWhere(selectedYear) : {};

  const clubs = await prisma.club.findMany({ where: { active: true, isTest }, orderBy: { name: "asc" } });

  const selectedClubIds = parseSelectionIds(params.clubIds);
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
  const baseInstanceWhere = {
    ...dataScope, ...yearWhere,
    ...(params.surveyTemplateId ? { surveyTemplateId: params.surveyTemplateId } : {}),
    ...(selectedClubIds.length ? { clubId: { in: selectedClubIds } } : {}),
  };
  const availableSurveys = await prisma.surveyInstance.findMany({
    where: baseInstanceWhere,
    select: { id: true, name: true, club: { select: { name: true } } },
    orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
  });
  const selectedSurveyIds = parseSelectionIds(params.surveyInstanceId);
  if (selectedSurveyIds.some(id => !availableSurveys.some(survey => survey.id === id))) {
    return <p role="alert">Et valgt arrangement findes ikke i dette udsnit. <Link href={`/dmu/dashboard?dataMode=${isTest ? "test" : "pilot"}`}>Nulstil filtrene</Link>.</p>;
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

  const activeFilters = [
    isTest ? "Testdata" : "Pilotdata",
    ...(selectedSurveyIds.length ? [`Arrangementer: ${selectedSurveyIds.length}`] : []),
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
  if (params.surveyTemplateId) exportParams.set("surveyTemplateId", params.surveyTemplateId);
  for (const id of selectedSurveyIds) exportParams.append("surveyInstanceId", id);
  if (respondentAgeGroupFilter) exportParams.set("respondentAgeGroup", respondentAgeGroupFilter);
  if (motocrossClassFilter) exportParams.set("motocrossClass", motocrossClassFilter);
  if (respondentRoleFilter) exportParams.set("respondentRole", respondentRoleFilter);
  const exportHref = `/api/exports/results${exportParams.size > 0 ? `?${exportParams.toString()}` : ""}`;

  const instanceWhere = { ...baseInstanceWhere, ...(selectedSurveyIds.length ? { id: { in: selectedSurveyIds } } : {}) };
  const responseWhere = {
    surveyInstance: instanceWhere,
    ...(selectedSurveyIds.length ? { surveyInstanceId: { in: selectedSurveyIds } } : {}),
    ...(selectedClubIds.length > 0 ? { clubId: { in: selectedClubIds } } : {}),
    ...(respondentAgeGroupFilter ? { respondentAgeGroup: respondentAgeGroupFilter } : {}),
    ...(motocrossClassFilter ? { motocrossClass: motocrossClassFilter } : {}),
    ...(respondentRoleFilter ? { respondentRole: respondentRoleFilter } : {}),
  };

  const [totalResponses, results, overviewSeries] = await Promise.all([
    prisma.surveyResponse.count({ where: responseWhere }),
    loadSurveyResults(responseWhere, instanceWhere),
    selectedSurveyIds.length > 1 ? loadResultOverview(responseWhere, instanceWhere) : Promise.resolve([]),
  ]);

  const chartSeries = selectedSurveyIds.length > 1 ? overviewSeries : [{
    id: "aggregate", label: selectedSurveyIds.length ? availableSurveys.find(s => s.id === selectedSurveyIds[0])!.name : "Samlede resultater",
    questions: overviewQuestions(results),
  }];
  const clubsInScope = selectedClubs.length > 0 ? selectedClubs : clubs;
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

        <nav aria-label="Datagrundlag" className="mt-3 inline-flex gap-1 rounded-xl border border-white/15 bg-black/10 p-1">
          {(["pilot", "test"] as const).map((mode) => <Link key={mode} href={`/dmu/dashboard?dataMode=${mode}`} aria-current={(isTest ? "test" : "pilot") === mode ? "page" : undefined} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${(isTest ? "test" : "pilot") === mode ? "bg-white text-primary shadow-sm" : "text-white/75 hover:bg-white/10 hover:text-white"}`}>{mode === "pilot" ? "Pilotdata" : "Testdata"}</Link>)}
        </nav>
        <MobileFilterPanel key={exportParams.toString()} count={activeFilters.length - 1 + (selectedYear ? 1 : 0)}>
        <form className="mt-3" method="get" aria-label="Filtrér resultater">
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
            <label htmlFor="dashboard-survey" className="block text-xs font-medium text-white/80">Arrangementer / udsendelser</label>
            <ClubMultiSelectFilter id="dashboard-survey" clubs={availableSurveys.map(s => ({ id: s.id, name: `${s.name} · ${s.club.name}` }))} initialSelectedIds={selectedSurveyIds} inputName="surveyInstanceId" labels={{ all: "Alle arrangementer", selected: "arrangementer valgt", search: "Søg arrangement", empty: "Ingen arrangementer matcher." }} />
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="dashboard-year" className="block text-xs font-medium text-white/80">År</label>
            <select id="dashboard-year" name="year" defaultValue={selectedYear ?? "all"} className="h-11 w-full min-w-0 rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground">
              <option value="all">Alle år</option>{[...new Set([currentYear, currentYear - 1, currentYear - 2, currentYear - 3, ...(selectedYear ? [selectedYear] : [])])].sort((a, b) => b - a).map((year) => <option key={year} value={year}>{year}</option>)}
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
            <Link href={`/dmu/dashboard?dataMode=${isTest ? "test" : "pilot"}`} className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Nulstil</Link>
            <button type="submit" className="h-11 rounded-xl bg-white px-5 text-sm font-semibold text-primary shadow-sm transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary">Anvend filtre</button>
          </div>

          </div>
        </form>
        </MobileFilterPanel>
      </section>

      {/* ── Statistik-kort ───────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <article key={card.label} className="min-w-0 rounded-[24px] border border-border/70 bg-card p-3 shadow-sm sm:p-5">
            <p className="break-words text-xs font-semibold text-muted-foreground sm:uppercase sm:tracking-[0.22em]">{card.label}</p>
            <p className="mt-2 font-heading text-2xl font-semibold tracking-tight text-foreground sm:mt-3 sm:text-3xl">{card.value}</p>
            <p className="mt-2 text-xs text-muted-foreground sm:text-sm">{card.hint}</p>
          </article>
        ))}
      </section>

      <ResultOverviewChart key={exportParams.toString()} series={chartSeries} comparison={selectedSurveyIds.length > 1} />

      <SurveyResultsPanel results={results} textQuestionId={params.textQuestionId} />
    </div>
  );
}
