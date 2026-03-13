import { AgeGroup, MemberRole, RaceClass } from "@prisma/client";
import Link from "next/link";
import { BenchmarkBarChart } from "@/components/charts/benchmark-bar-chart";
import { QuestionDistributionTile } from "@/components/charts/question-distribution-tile";
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

type ClubDashboardProps = {
  searchParams: Promise<{ ageGroup?: string; raceClass?: string; memberRole?: string; surveyInstanceId?: string }>;
};

export default async function ClubDashboardPage({ searchParams }: ClubDashboardProps) {
  const session = await requireRole("CLUB_ADMIN");
  const params = await searchParams;

  if (!session.clubId) {
    return (
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">Klubdashboard</h2>
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
      _count: {
        select: {
          responses: true,
        },
      },
    },
    orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
  });

  const selectedSurvey = availableSurveys.find((survey) => survey.id === params.surveyInstanceId);
  const selectedSurveyId = selectedSurvey?.id;

  const ageGroupFilter = ageGroupOptions.some((option) => option.value === params.ageGroup) ? (params.ageGroup as AgeGroup) : undefined;
  const raceClassFilter = raceClassOptions.some((option) => option.value === params.raceClass) ? (params.raceClass as RaceClass) : undefined;
  const memberRoleFilter = memberRoleOptions.some((option) => option.value === params.memberRole) ? (params.memberRole as MemberRole) : undefined;

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

  const [members, surveys, ownResponsesCount, benchmarkResponsesCount, latestSurvey, pendingSendCount, benchmarkQuestions] = await Promise.all([
    prisma.member.count({ where: { clubId: session.clubId, active: true } }),
    prisma.surveyInstance.count({ where: { clubId: session.clubId } }),
    prisma.surveyResponse.count({ where: ownResponseWhere }),
    prisma.surveyResponse.count({ where: benchmarkResponseWhere }),
    prisma.surveyInstance.findFirst({
      where: { clubId: session.clubId },
      select: {
        id: true,
        name: true,
        status: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.scheduledSend.count({
      where: {
        status: "PENDING",
        surveyInstance: {
          clubId: session.clubId,
        },
      },
    }),
    prisma.question.findMany({
      where: {
        scope: "DMU_STANDARD",
        benchmarkKey: { not: null },
        questionType: "SCALE_1_5",
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const canShowOwnSegment = ownResponsesCount >= SUPPRESSION_THRESHOLD;
  const canShowBenchmarkSegment = benchmarkResponsesCount >= SUPPRESSION_THRESHOLD;

  const benchmarkRows: { label: string; own: number; benchmark: number }[] = [];
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
        where: {
          questionId: question.id,
          numericValue: { not: null },
          surveyResponse: ownResponseWhere,
        },
        _avg: { numericValue: true },
      }),
      prisma.surveyAnswer.aggregate({
        where: {
          questionId: question.id,
          numericValue: { not: null },
          surveyResponse: benchmarkResponseWhere,
        },
        _avg: { numericValue: true },
      }),
      prisma.surveyAnswer.findMany({
        where: {
          questionId: question.id,
          numericValue: { not: null },
          surveyResponse: ownResponseWhere,
        },
        select: { numericValue: true },
      }),
    ]);

    const ownCount = ownNumericAnswers.length;
    const category = question.benchmarkKey ? question.benchmarkKey.split("_")[0] : "Generel";
    const distribution = [1, 2, 3, 4, 5].map((scaleValue) => ({
      label: String(scaleValue),
      value: ownNumericAnswers.filter((answer) => answer.numericValue === scaleValue).length,
    }));

    distributionRows.push({
      questionTitle: question.title,
      category,
      avg: ownAgg._avg.numericValue ? Number(ownAgg._avg.numericValue.toFixed(2)) : null,
      count: ownCount,
      suppressed: ownCount < SUPPRESSION_THRESHOLD,
      distribution,
    });

    if (ownAgg._avg.numericValue && benchmarkAgg._avg.numericValue && canShowOwnSegment && canShowBenchmarkSegment) {
      benchmarkRows.push({
        label: question.title.length > 32 ? `${question.title.slice(0, 32)}…` : question.title,
        own: Number(ownAgg._avg.numericValue.toFixed(2)),
        benchmark: Number(benchmarkAgg._avg.numericValue.toFixed(2)),
      });
    }
  }

  const textResponses = canShowOwnSegment
    ? await prisma.surveyAnswer.findMany({
        where: {
          textValue: { not: null },
          surveyResponse: ownResponseWhere,
          question: {
            questionType: "TEXT",
          },
        },
        include: {
          question: true,
        },
        orderBy: {
          surveyResponse: { submittedAt: "desc" },
        },
        take: 30,
      })
    : [];

  const overallOwn = benchmarkRows.length > 0 ? benchmarkRows.reduce((sum, row) => sum + row.own, 0) / benchmarkRows.length : null;
  const overallBenchmark = benchmarkRows.length > 0 ? benchmarkRows.reduce((sum, row) => sum + row.benchmark, 0) / benchmarkRows.length : null;
  const delta = overallOwn && overallBenchmark ? overallOwn - overallBenchmark : null;
  const responseCoverage = members > 0 ? Math.min((ownResponsesCount / members) * 100, 100) : 0;

  const activeFilters = [
    selectedSurvey ? `Spørgeskema: ${selectedSurvey.name}` : undefined,
    ageGroupOptions.find((option) => option.value === ageGroupFilter)?.label,
    raceClassOptions.find((option) => option.value === raceClassFilter)?.label,
    memberRoleOptions.find((option) => option.value === memberRoleFilter)?.label,
  ].filter(Boolean) as string[];

  // DMU improvement text question - filtered to this club only
  const dmuImprovementQuestion = await prisma.question.findFirst({
    where: { benchmarkKey: "DMU_CENTRAL_IMPROVEMENT", scope: "DMU_STANDARD" },
  });

  const clubImprovementAnswers =
    dmuImprovementQuestion && canShowOwnSegment
      ? await prisma.surveyAnswer.findMany({
          where: {
            questionId: dmuImprovementQuestion.id,
            textValue: { not: null },
            surveyResponse: ownResponseWhere,
          },
          include: { surveyResponse: { select: { submittedAt: true } } },
          orderBy: { surveyResponse: { submittedAt: "desc" } },
        })
      : [];

  const clubImprovementResponses = clubImprovementAnswers.map((a) => ({
    text: a.textValue!,
    submittedAt: a.surveyResponse.submittedAt.toISOString(),
  }));
  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-background p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
            <p className="mt-2 text-sm text-muted-foreground">Egen klub sammenlignet med samlet niveau på DMU-standardspørgsmål.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/club/overview" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
              Gå til overblik
            </Link>
            <Link href="/club/surveys/latest" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
              Seneste spørgeskema
            </Link>
            <Link href="/club/outbox" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
              Se udsendelser
            </Link>
            <Link href="/club/events" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
              Se arrangementer
            </Link>
          </div>
        </div>

        <form className="mt-4 grid gap-3 md:grid-cols-5" method="get">
          <select name="surveyInstanceId" defaultValue={selectedSurveyId ?? ""} className="rounded-md border px-3 py-2 text-sm">
            <option value="">Alle spørgeskemaer</option>
            {availableSurveys.map((survey) => (
              <option key={survey.id} value={survey.id}>
                {survey.name} ({survey._count.responses} svar)
              </option>
            ))}
          </select>

          <select name="ageGroup" defaultValue={ageGroupFilter ?? ""} className="rounded-md border px-3 py-2 text-sm">
            <option value="">Alle aldersgrupper</option>
            {ageGroupOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select name="raceClass" defaultValue={raceClassFilter ?? ""} className="rounded-md border px-3 py-2 text-sm">
            <option value="">Alle køreklasser</option>
            {raceClassOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select name="memberRole" defaultValue={memberRoleFilter ?? ""} className="rounded-md border px-3 py-2 text-sm">
            <option value="">Alle roller</option>
            {memberRoleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Anvend filtre
          </button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {activeFilters.length > 0 ? (
            <>
              {activeFilters.map((filter) => (
                <span key={filter} className="rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                  {filter}
                </span>
              ))}
              <Link href="/club/dashboard" className="text-xs font-medium text-primary underline">
                Nulstil filtre
              </Link>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Ingen aktive filtre</span>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Aktive medlemmer</p>
          <p className="mt-1 text-2xl font-semibold">{members}</p>
        </article>
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Spørgeskemaer</p>
          <p className="mt-1 text-2xl font-semibold">{surveys}</p>
        </article>
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Besvarelser (filtreret)</p>
          <p className="mt-1 text-2xl font-semibold">{ownResponsesCount}</p>
        </article>
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Forskel fra samlet niveau</p>
          <p className="mt-1 text-2xl font-semibold">
            {delta !== null ? `${delta.toFixed(2)}` : "-"}
          </p>
          {delta !== null ? (
            <p className="mt-1 text-xs text-muted-foreground">{delta >= 0 ? "Over" : "Under"} samlet niveau</p>
          ) : null}
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Egne svar i filter</p>
          <p className="mt-1 text-2xl font-semibold">{ownResponsesCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">Grundlag for klubindsigt</p>
        </article>
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Samlet svargrundlag</p>
          <p className="mt-1 text-2xl font-semibold">{benchmarkResponsesCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">Grundlag for sammenligning</p>
        </article>
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Svar-dækning i klub</p>
          <p className="mt-1 text-2xl font-semibold">{responseCoverage.toFixed(0)}%</p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${responseCoverage}%` }} />
          </div>
        </article>
      </section>

      {/* DMU text question tile */}
      {dmuImprovementQuestion && (
        <section className="rounded-xl border bg-background p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Åbent spørgsmål · DMU standard</p>
              <h3 className="mt-1 text-base font-semibold">{dmuImprovementQuestion.title}</h3>
              {canShowOwnSegment ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {clubImprovementResponses.length} besvarelse{clubImprovementResponses.length !== 1 ? "r" : ""} fra din klub.
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">For få svar til at vise (krav: min. {SUPPRESSION_THRESHOLD}).</p>
              )}
            </div>
            {canShowOwnSegment && (
              <TextResponsesModal
                questionTitle={dmuImprovementQuestion.title}
                responses={clubImprovementResponses}
                triggerLabel="Se din klubs besvarelser"
              />
            )}
          </div>
          {clubImprovementResponses.length > 0 && (
            <div className="mt-4 space-y-2">
              {clubImprovementResponses.slice(0, 2).map((r, i) => (
                <div key={i} className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
                  <p className="text-sm">{r.text}</p>
                </div>
              ))}
              {clubImprovementResponses.length > 2 && (
                <p className="text-xs text-muted-foreground pl-1">
                  + {clubImprovementResponses.length - 2} flere — åbn popup for at se alle.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {!canShowOwnSegment ? (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          For få svar i valgt segment ({ownResponsesCount}). Data vises først ved mindst {SUPPRESSION_THRESHOLD} svar.
        </section>
      ) : null}

      <section className="rounded-xl border bg-background p-6">
        <div className="mb-4">
          <div>
            <h3 className="text-lg font-semibold">Sammenligning pr. spørgsmål</h3>
            <p className="text-sm text-muted-foreground">
              {selectedSurvey ? `Valgt spørgeskema: ${selectedSurvey.name}. ` : ""}Kun DMU-standardspørgsmål med sammenligningsnøgle.
            </p>
          </div>
        </div>

        {canShowOwnSegment && canShowBenchmarkSegment && benchmarkRows.length > 0 ? (
          <BenchmarkBarChart data={benchmarkRows} />
        ) : (
          <p className="text-sm text-muted-foreground">Benchmark kan ikke vises for nuværende filter pga. anonymitetsgrænse.</p>
        )}
      </section>

      <section className="rounded-xl border bg-background p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Visuel svarfordeling</h3>
          <p className="text-sm text-muted-foreground">
            Donut-grafer for hvert skala-spørgsmål, så det er lettere at se spredning og tendenser.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {distributionRows.map((row) => (
            <QuestionDistributionTile
              key={row.questionTitle}
              title={row.questionTitle}
              category={row.category}
              avg={row.avg}
              count={row.count}
              suppressed={row.suppressed}
              data={row.distribution}
              suppressionThreshold={SUPPRESSION_THRESHOLD}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
