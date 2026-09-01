import Link from "next/link";
import { AgeGroup, MemberRole, RaceClass } from "@prisma/client";
import { BenchmarkBarChart } from "@/components/charts/benchmark-bar-chart";
import { QuestionDistributionBoard } from "@/components/charts/question-distribution-board";
import { TextResponsesModal } from "@/components/text-responses-modal";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SUPPRESSION_THRESHOLD = 5;

const ageGroupOptions: { value: AgeGroup; label: string }[] = [
  { value: "UNDER_18", label: "Under 18" },
  { value: "AGE_18_30", label: "18-30" },
  { value: "AGE_31_50", label: "31-50" },
  { value: "AGE_51_PLUS", label: "51+" },
];

const raceClassOptions: { value: RaceClass; label: string }[] = [
  { value: "MOTOCROSS", label: "Motocross" },
  { value: "ENDURO", label: "Enduro" },
  { value: "SPEEDWAY", label: "Speedway" },
  { value: "TRIAL", label: "Trial" },
];

const memberRoleOptions: { value: MemberRole; label: string }[] = [
  { value: "RIDER", label: "Kører" },
  { value: "VOLUNTEER", label: "Frivillig" },
];

const benchmarkCategoryLabels: Record<string, string> = {
  SATISFACTION: "Tilfredshed",
  COMMUNITY: "Fællesskab",
  RECOMMENDATION: "Anbefaling",
  SAFETY: "Sikkerhed",
  ACTIVITY: "Aktivitetsudbytte",
  JOIN: "Motivation",
  CHURN: "Fastholdelse",
  DMU: "DMU centralt",
  GENEREL: "Generel",
};

const dashboardLinks = [
  { href: "/club/overview", label: "Overblik" },
  { href: "/club/events", label: "Arrangementer" },
];

function formatBenchmarkCategory(value: string) {
  const normalized = value.trim().toUpperCase();
  return benchmarkCategoryLabels[normalized] ?? `${normalized.charAt(0)}${normalized.slice(1).toLowerCase()}`;
}

type ClubDashboardProps = {
  searchParams: Promise<{ ageGroup?: string; raceClass?: string; memberRole?: string; surveyInstanceId?: string }>;
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

  const availableSurveys = await prisma.surveyInstance.findMany({
    where: { clubId: session.clubId },
    select: {
      id: true,
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

  const ageGroupFilter = ageGroupOptions.some((o) => o.value === params.ageGroup) ? (params.ageGroup as AgeGroup) : undefined;
  const raceClassFilter = raceClassOptions.some((o) => o.value === params.raceClass) ? (params.raceClass as RaceClass) : undefined;
  const memberRoleFilter = memberRoleOptions.some((o) => o.value === params.memberRole) ? (params.memberRole as MemberRole) : undefined;

  const ownResponseWhere = {
    clubId: session.clubId,
    ...(selectedSurveyId ? { surveyInstanceId: selectedSurveyId } : {}),
    ...(ageGroupFilter ? { ageGroup: ageGroupFilter } : {}),
    ...(raceClassFilter ? { raceClass: raceClassFilter } : {}),
    ...(memberRoleFilter ? { memberRole: memberRoleFilter } : {}),
  };

  const benchmarkResponseWhere = {
    ...(ageGroupFilter ? { ageGroup: ageGroupFilter } : {}),
    ...(raceClassFilter ? { raceClass: raceClassFilter } : {}),
    ...(memberRoleFilter ? { memberRole: memberRoleFilter } : {}),
  };

  const [members, surveys, ownResponsesCount, benchmarkResponsesCount, benchmarkQuestions] = await Promise.all([
    prisma.member.count({ where: { clubId: session.clubId, active: true } }),
    prisma.surveyInstance.count({ where: { clubId: session.clubId } }),
    prisma.surveyResponse.count({ where: ownResponseWhere }),
    prisma.surveyResponse.count({ where: benchmarkResponseWhere }),
    prisma.question.findMany({
      where: { scope: "DMU_STANDARD", benchmarkKey: { not: null }, questionType: "SCALE_1_5" },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const canShowOwnSegment = ownResponsesCount >= SUPPRESSION_THRESHOLD;
  const canShowBenchmarkSegment = benchmarkResponsesCount >= SUPPRESSION_THRESHOLD;

  const benchmarkRows: { label: string; own: number; benchmark: number }[] = [];
  const categoryBenchmarks = new Map<string, { ownWeightedSum: number; ownCount: number; benchmarkWeightedSum: number; benchmarkCount: number }>();
  const distributionRows: {
    questionTitle: string;
    category: string;
    avg: number | null;
    count: number;
    suppressed: boolean;
    distribution: { label: string; value: number }[];
  }[] = [];

  for (const question of benchmarkQuestions) {
    const [ownAgg, benchmarkAgg, ownNumericAnswers] = await Promise.all([
      prisma.surveyAnswer.aggregate({
        where: { questionId: question.id, numericValue: { not: null }, surveyResponse: ownResponseWhere },
        _count: { numericValue: true },
        _avg: { numericValue: true },
      }),
      prisma.surveyAnswer.aggregate({
        where: { questionId: question.id, numericValue: { not: null }, surveyResponse: benchmarkResponseWhere },
        _count: { numericValue: true },
        _avg: { numericValue: true },
      }),
      prisma.surveyAnswer.findMany({
        where: { questionId: question.id, numericValue: { not: null }, surveyResponse: ownResponseWhere },
        select: { numericValue: true },
      }),
    ]);

    const ownCount = ownNumericAnswers.length;
    const rawCategory = question.benchmarkKey ? question.benchmarkKey.split("_")[0] : "GENEREL";
    const category = formatBenchmarkCategory(rawCategory);
    const distribution = [1, 2, 3, 4, 5].map((v) => ({
      label: String(v),
      value: ownNumericAnswers.filter((a) => a.numericValue === v).length,
    }));

    distributionRows.push({
      questionTitle: question.title,
      category,
      avg: ownAgg._avg.numericValue ? Number(ownAgg._avg.numericValue.toFixed(2)) : null,
      count: ownCount,
      suppressed: ownCount < SUPPRESSION_THRESHOLD,
      distribution,
    });

    if (ownAgg._avg.numericValue && benchmarkAgg._avg.numericValue) {
      const current = categoryBenchmarks.get(rawCategory) ?? { ownWeightedSum: 0, ownCount: 0, benchmarkWeightedSum: 0, benchmarkCount: 0 };
      categoryBenchmarks.set(rawCategory, {
        ownWeightedSum: current.ownWeightedSum + Number(ownAgg._avg.numericValue) * ownAgg._count.numericValue,
        ownCount: current.ownCount + ownAgg._count.numericValue,
        benchmarkWeightedSum: current.benchmarkWeightedSum + Number(benchmarkAgg._avg.numericValue) * benchmarkAgg._count.numericValue,
        benchmarkCount: current.benchmarkCount + benchmarkAgg._count.numericValue,
      });
    }
  }

  if (canShowOwnSegment && canShowBenchmarkSegment) {
    for (const [rawCategory, values] of Array.from(categoryBenchmarks.entries()).sort(([a], [b]) => a.localeCompare(b, "da"))) {
      if (values.ownCount === 0 || values.benchmarkCount === 0) continue;
      benchmarkRows.push({
        label: formatBenchmarkCategory(rawCategory),
        own: Number((values.ownWeightedSum / values.ownCount).toFixed(2)),
        benchmark: Number((values.benchmarkWeightedSum / values.benchmarkCount).toFixed(2)),
      });
    }
  }

  const overallOwn = benchmarkRows.length > 0 ? benchmarkRows.reduce((s, r) => s + r.own, 0) / benchmarkRows.length : null;
  const overallBenchmark = benchmarkRows.length > 0 ? benchmarkRows.reduce((s, r) => s + r.benchmark, 0) / benchmarkRows.length : null;
  const delta = overallOwn && overallBenchmark ? overallOwn - overallBenchmark : null;
  const responseCoverage = members > 0 ? Math.min((ownResponsesCount / members) * 100, 100) : 0;

  const activeFilters = [
    selectedSurvey ? `Spørgeskema: ${selectedSurvey.name}` : undefined,
    ageGroupFilter ? `Alder: ${ageGroupOptions.find((o) => o.value === ageGroupFilter)?.label}` : undefined,
    raceClassFilter ? `Køreklasse: ${raceClassOptions.find((o) => o.value === raceClassFilter)?.label}` : undefined,
    memberRoleFilter ? `Rolle: ${memberRoleOptions.find((o) => o.value === memberRoleFilter)?.label}` : undefined,
  ].filter(Boolean) as string[];

  const dmuImprovementQuestion = await prisma.question.findFirst({
    where: { benchmarkKey: "DMU_CENTRAL_IMPROVEMENT", scope: "DMU_STANDARD" },
  });

  const clubImprovementAnswers =
    dmuImprovementQuestion && canShowOwnSegment
      ? await prisma.surveyAnswer.findMany({
          where: { questionId: dmuImprovementQuestion.id, textValue: { not: null }, surveyResponse: ownResponseWhere },
          include: { surveyResponse: { select: { submittedAt: true } } },
          orderBy: { surveyResponse: { submittedAt: "desc" } },
        })
      : [];

  const clubImprovementResponses = clubImprovementAnswers.map((a) => ({
    text: a.textValue!,
    submittedAt: a.surveyResponse.submittedAt.toISOString(),
  }));

  const summaryCards = [
    { label: "Besvarelser", value: ownResponsesCount, hint: "I valgt udsnit" },
    { label: "Medlemmer", value: members, hint: "Aktive medlemmer" },
    { label: "Dækning", value: `${responseCoverage.toFixed(0)}%`, hint: "Svar mod medlemstal" },
    { label: "Spørgeskemaer", value: surveys, hint: "Alle oprettede" },
  ];

  const canRenderBenchmark = canShowOwnSegment && canShowBenchmarkSegment && benchmarkRows.length > 0;
  const exportParams = new URLSearchParams();
  if (selectedSurveyId) exportParams.set("surveyInstanceId", selectedSurveyId);
  if (ageGroupFilter) exportParams.set("ageGroup", ageGroupFilter);
  if (raceClassFilter) exportParams.set("raceClass", raceClassFilter);
  if (memberRoleFilter) exportParams.set("memberRole", memberRoleFilter);
  const exportHref = `/api/exports/results${exportParams.size > 0 ? `?${exportParams.toString()}` : ""}`;

  return (
    <div className="space-y-6">
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
        <form className="mt-4 grid gap-2 rounded-[24px] border border-white/12 bg-white/8 p-3 backdrop-blur-sm md:grid-cols-6" method="get">
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
            <select name="ageGroup" defaultValue={ageGroupFilter ?? ""}
              className="h-11 w-full appearance-none rounded-2xl border border-border/70 bg-background/95 pl-3 pr-8 text-sm text-foreground">
              <option value="">Alle aldre</option>
              {ageGroupOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">▾</span>
          </div>

          {/* Klasse */}
          <div className="relative md:col-span-1">
            <select name="raceClass" defaultValue={raceClassFilter ?? ""}
              className="h-11 w-full appearance-none rounded-2xl border border-border/70 bg-background/95 pl-3 pr-8 text-sm text-foreground">
              <option value="">Alle klasser</option>
              {raceClassOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">▾</span>
          </div>

          {/* Rolle */}
          <div className="relative md:col-span-1">
            <select name="memberRole" defaultValue={memberRoleFilter ?? ""}
              className="h-11 w-full appearance-none rounded-2xl border border-border/70 bg-background/95 pl-3 pr-8 text-sm text-foreground">
              <option value="">Alle roller</option>
              {memberRoleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
              <p className="mt-1 text-sm text-muted-foreground">Jeres gennemsnit mod samlet niveau pr. kategori.</p>
            </div>
            <span className="rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground">
              {benchmarkRows.length} kategorier
            </span>
          </div>
          <div className="mt-5 rounded-[22px] border border-border/60 bg-background/80 p-4">
            {canRenderBenchmark ? (
              <BenchmarkBarChart data={benchmarkRows} />
            ) : (
              <div className="rounded-[20px] border border-dashed border-border/70 bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground">
                Benchmark kan ikke vises for det valgte udsnit endnu.
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
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Svargrundlag</p>
                <span className="text-sm font-semibold text-foreground">{benchmarkResponsesCount}</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Dækning</p>
                <span className="text-sm font-semibold text-foreground">{responseCoverage.toFixed(0)}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${responseCoverage}%` }} />
              </div>
            </div>
          </div>
        </article>
      </section>

      {/* ── Spørgsmålsfordeling ──────────────────────────────────────────── */}
      <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Spørgsmålsfordeling</h2>
            <p className="mt-1 text-sm text-muted-foreground">Find hurtigt de spørgsmål, der skiller sig ud.</p>
          </div>
          <span className="rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground">
            {distributionRows.length} spørgsmål
          </span>
        </div>
        <div className="mt-5 rounded-[22px] border border-border/60 bg-background/80 p-4">
          <QuestionDistributionBoard rows={distributionRows} suppressionThreshold={SUPPRESSION_THRESHOLD} />
        </div>
      </section>

      {/* ── Åbne svar ────────────────────────────────────────────────────── */}
      {dmuImprovementQuestion ? (
        <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Åbne svar</p>
              <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-foreground">{dmuImprovementQuestion.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {canShowOwnSegment ? "Seneste kommentarer fra klubben." : `Kræver mindst ${SUPPRESSION_THRESHOLD} svar.`}
              </p>
            </div>
            {canShowOwnSegment ? (
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground">
                  {clubImprovementResponses.length} svar
                </span>
                <TextResponsesModal questionTitle={dmuImprovementQuestion.title} responses={clubImprovementResponses} triggerLabel="Se alle" />
              </div>
            ) : null}
          </div>

          {!canShowOwnSegment ? null : clubImprovementResponses.length > 0 ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {clubImprovementResponses.slice(0, 2).map((response, index) => (
                <article key={`${response.submittedAt}-${index}`} className="rounded-[22px] border border-border/70 bg-background/85 p-4">
                  <p className="text-sm leading-6 text-foreground">{response.text}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-[22px] border border-dashed border-border/70 bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground">
              Ingen åbne svar i det valgte udsnit.
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
