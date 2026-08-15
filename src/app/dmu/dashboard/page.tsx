import Link from "next/link";
import { AgeGroup, MemberRole, RaceClass } from "@prisma/client";
import { ClubComparisonChart } from "@/components/charts/benchmark-bar-chart";
import { QuestionDistributionBoard } from "@/components/charts/question-distribution-board";
import { ClubMultiSelectFilter } from "@/components/club-multi-select-filter";
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

const surveyActionLinks = [
  { href: "/dmu/send", label: "Udsend spørgeskema" },
  { href: "/dmu/calendar", label: "Kalender" },
];

type DmuDashboardProps = {
  searchParams: Promise<{
    ageGroup?: string;
    raceClass?: string;
    memberRole?: string;
    surveyTemplateId?: string;
    clubIds?: string | string[];
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

  const clubs = await prisma.club.findMany({ where: { active: true }, orderBy: { name: "asc" } });

  const selectedClubIds = parseClubIds(params.clubIds);
  const selectedClubs = clubs.filter((club) => selectedClubIds.includes(club.id));

  const availableTemplates = await prisma.surveyTemplate.findMany({
    where: {
      surveyInstances: {
        some: {
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
          surveyInstances: true,
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
            ...(selectedClubIds.length > 0 ? { clubId: { in: selectedClubIds } } : {}),
          },
          select: { id: true },
        })
      ).map((instance) => instance.id)
    : [];

  const ageGroupFilter = ageGroupOptions.some((option) => option.value === params.ageGroup) ? (params.ageGroup as AgeGroup) : undefined;
  const raceClassFilter = raceClassOptions.some((option) => option.value === params.raceClass) ? (params.raceClass as RaceClass) : undefined;
  const memberRoleFilter = memberRoleOptions.some((option) => option.value === params.memberRole) ? (params.memberRole as MemberRole) : undefined;

  const activeFilters = [
    ...(selectedTemplate ? [`Skabelon: ${selectedTemplate.name}`] : []),
    ...(selectedClubs.length > 0 ? [`Klubber: ${selectedClubs.length}`] : []),
    ...(ageGroupFilter
      ? [`Alder: ${ageGroupOptions.find((option) => option.value === ageGroupFilter)?.label ?? ageGroupFilter}`]
      : []),
    ...(raceClassFilter
      ? [`Køreklasse: ${raceClassOptions.find((option) => option.value === raceClassFilter)?.label ?? raceClassFilter}`]
      : []),
    ...(memberRoleFilter
      ? [`Rolle: ${memberRoleOptions.find((option) => option.value === memberRoleFilter)?.label ?? memberRoleFilter}`]
      : []),
  ];

  const responseWhere = {
    ...(selectedTemplate ? { surveyInstanceId: { in: selectedTemplateInstanceIds } } : {}),
    ...(selectedClubIds.length > 0 ? { clubId: { in: selectedClubIds } } : {}),
    ...(ageGroupFilter ? { ageGroup: ageGroupFilter } : {}),
    ...(raceClassFilter ? { raceClass: raceClassFilter } : {}),
    ...(memberRoleFilter ? { memberRole: memberRoleFilter } : {}),
  };

  const [totalResponses, benchmarkQuestions] = await Promise.all([
    prisma.surveyResponse.count({ where: responseWhere }),
    prisma.question.findMany({
      where: {
        scope: "DMU_STANDARD",
        benchmarkKey: { not: null },
        questionType: "SCALE_1_5",
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const benchmarkRows: {
    questionTitle: string;
    category: string;
    avg: number | null;
    count: number;
    suppressed: boolean;
    distribution: { label: string; value: number }[];
  }[] = [];

  for (const question of benchmarkQuestions) {
    const numericAnswers = await prisma.surveyAnswer.findMany({
      where: {
        questionId: question.id,
        numericValue: { not: null },
        surveyResponse: responseWhere,
      },
      select: { numericValue: true },
    });

    const count = numericAnswers.length;
    const category = question.benchmarkKey ? question.benchmarkKey.split("_")[0] : "Generel";
    const distribution = [1, 2, 3, 4, 5].map((scaleValue) => ({
      label: String(scaleValue),
      value: numericAnswers.filter((answer) => answer.numericValue === scaleValue).length,
    }));

    if (count < SUPPRESSION_THRESHOLD) {
      benchmarkRows.push({
        questionTitle: question.title,
        category,
        avg: null,
        count,
        suppressed: true,
        distribution,
      });
      continue;
    }

    const agg = await prisma.surveyAnswer.aggregate({
      where: {
        questionId: question.id,
        numericValue: { not: null },
        surveyResponse: responseWhere,
      },
      _avg: { numericValue: true },
    });

    benchmarkRows.push({
      questionTitle: question.title,
      category,
      avg: agg._avg.numericValue ? Number(agg._avg.numericValue.toFixed(2)) : null,
      count,
      suppressed: false,
      distribution,
    });
  }

  const keyQuestion = benchmarkQuestions[0];
  const clubComparisonRows: { label: string; own: number; benchmark: number }[] = [];
  const clubTableRows: { clubId: string; clubName: string; count: number; avg: number | null; suppressed: boolean }[] = [];
  const clubsToCompare = selectedClubs.length > 0 ? selectedClubs : clubs;

  let nationalKeyAverage = 0;
  if (keyQuestion) {
    const nationalCount = await prisma.surveyAnswer.count({
      where: {
        questionId: keyQuestion.id,
        numericValue: { not: null },
        surveyResponse: responseWhere,
      },
    });

    if (nationalCount >= SUPPRESSION_THRESHOLD) {
      const nationalAgg = await prisma.surveyAnswer.aggregate({
        where: {
          questionId: keyQuestion.id,
          numericValue: { not: null },
          surveyResponse: responseWhere,
        },
        _avg: { numericValue: true },
      });
      nationalKeyAverage = Number((nationalAgg._avg.numericValue ?? 0).toFixed(2));
    }

    for (const club of clubsToCompare) {
      const clubCountForKeyQuestion = await prisma.surveyAnswer.count({
        where: {
          questionId: keyQuestion.id,
          numericValue: { not: null },
          surveyResponse: {
            ...responseWhere,
            clubId: club.id,
          },
        },
      });

      if (clubCountForKeyQuestion < SUPPRESSION_THRESHOLD || nationalKeyAverage === 0) {
        clubTableRows.push({ clubId: club.id, clubName: club.name, count: clubCountForKeyQuestion, avg: null, suppressed: true });
        continue;
      }

      const clubAgg = await prisma.surveyAnswer.aggregate({
        where: {
          questionId: keyQuestion.id,
          numericValue: { not: null },
          surveyResponse: {
            ...responseWhere,
            clubId: club.id,
          },
        },
        _avg: { numericValue: true },
      });

      const clubAvg = Number((clubAgg._avg.numericValue ?? 0).toFixed(2));
      clubTableRows.push({
        clubId: club.id,
        clubName: club.name,
        count: clubCountForKeyQuestion,
        avg: clubAvg,
        suppressed: false,
      });
      clubComparisonRows.push({
        label: club.name.length > 20 ? `${club.name.slice(0, 20)}...` : club.name,
        own: clubAvg,
        benchmark: nationalKeyAverage,
      });
    }
  }

  const dmuImprovementQuestion = await prisma.question.findFirst({
    where: { benchmarkKey: "DMU_CENTRAL_IMPROVEMENT", scope: "DMU_STANDARD" },
  });

  const dmuImprovementAnswers = dmuImprovementQuestion
    ? await prisma.surveyAnswer.findMany({
        where: {
          questionId: dmuImprovementQuestion.id,
          textValue: { not: null },
          surveyResponse: responseWhere,
        },
        include: {
          surveyResponse: {
            select: { submittedAt: true, clubId: true },
          },
        },
        orderBy: { surveyResponse: { submittedAt: "desc" } },
      })
    : [];

  const improvementResponses = dmuImprovementAnswers.map((answer) => ({
    text: answer.textValue!,
    clubName: clubs.find((club) => club.id === answer.surveyResponse.clubId)?.name ?? "Ukendt klub",
    submittedAt: answer.surveyResponse.submittedAt.toISOString(),
  }));

  const summaryCards = [
    { label: "Besvarelser", value: totalResponses, hint: "I valgt udsnit" },
    { label: "Klubber", value: clubsToCompare.length, hint: selectedClubs.length > 0 ? "Udvalgte klubber" : "Aktive klubber" },
    { label: "Benchmarks", value: benchmarkQuestions.length, hint: "Skala 1-5" },
    { label: "Filtre", value: activeFilters.length, hint: activeFilters.length > 0 ? "Aktive" : "Ingen valgt" },
  ];

  const scopePills = activeFilters.length > 0 ? activeFilters : ["Hele DMU"];

  return (
    <div className="space-y-6">
      <section className="overflow-visible rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl space-y-4">
            <span className="inline-flex w-fit items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/90">
              Analyse
            </span>
            <div className="space-y-2 text-white/75 [&_p]:text-white/75">
              <h1 className="font-heading text-3xl font-semibold tracking-tight text-white md:text-4xl">National analyse</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">Benchmark, klubsammenligning og åbne svar samlet i ét arbejdsrum.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {scopePills.map((pill) => (
                <span
                  key={pill}
                  className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/85"
                >
                  {pill}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:w-[320px]">
            {surveyActionLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-white/16"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <form className="mt-6 grid gap-3 rounded-[24px] border border-white/12 bg-white/8 p-4 backdrop-blur-sm md:grid-cols-7" method="get">
          <ClubMultiSelectFilter clubs={clubs} initialSelectedIds={selectedClubIds} />

          <select name="surveyTemplateId" defaultValue={selectedTemplate?.id ?? ""} className="h-11 rounded-2xl border border-white/12 bg-white/96 px-3 text-sm text-foreground md:col-span-1">
            <option value="">Alle skabeloner</option>
            {availableTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({template.surveyType.toLowerCase()} · {template._count.surveyInstances} udsendelser)
              </option>
            ))}
          </select>

          <select name="ageGroup" defaultValue={ageGroupFilter ?? ""} className="h-11 rounded-2xl border border-white/12 bg-white/96 px-3 text-sm text-foreground md:col-span-1">
            <option value="">Alle aldre</option>
            {ageGroupOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select name="raceClass" defaultValue={raceClassFilter ?? ""} className="h-11 rounded-2xl border border-white/12 bg-white/96 px-3 text-sm text-foreground md:col-span-1">
            <option value="">Alle klasser</option>
            {raceClassOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select name="memberRole" defaultValue={memberRoleFilter ?? ""} className="h-11 rounded-2xl border border-white/12 bg-white/96 px-3 text-sm text-foreground md:col-span-1">
            <option value="">Alle roller</option>
            {memberRoleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="h-11 rounded-2xl bg-white px-4 text-sm font-semibold text-primary shadow-sm transition hover:-translate-y-0.5 hover:bg-white/92 md:col-span-1"
          >
            Opdater
          </button>

          <Link
            href="/dmu/dashboard"
            className="flex h-11 items-center justify-center rounded-2xl border border-white/15 px-4 text-sm font-medium text-white/85 transition hover:bg-white/10 md:col-span-1"
          >
            Nulstil
          </Link>
        </form>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <article key={card.label} className="rounded-[24px] border border-border/70 bg-card p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{card.label}</p>
            <p className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground">{card.value}</p>
            <p className="mt-2 text-sm text-muted-foreground">{card.hint}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_360px]">
        <article className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Klubsammenligning</h2>
              <p className="mt-1 text-sm text-muted-foreground">Score mod nationalt niveau på det første benchmarkspørgsmål.</p>
            </div>
            <span className="rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground">Skala 1-5</span>
          </div>

          <div className="mt-5 rounded-[22px] border border-border/60 bg-background/80 p-4">
            {clubComparisonRows.length > 0 ? (
              <ClubComparisonChart data={clubComparisonRows} />
            ) : (
              <div className="rounded-[20px] border border-dashed border-border/70 bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground">
                For få svar til sammenligning i det valgte udsnit.
              </div>
            )}
          </div>
        </article>

        <article className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
          <div className="space-y-3">
            <div className="rounded-[22px] border border-primary/15 bg-primary/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">Adgang</p>
              <p className="mt-2 text-sm text-foreground">Kun DMU ser klubniveau og direkte links til klubberne.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-[22px] border border-border/70 bg-background/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">National score</p>
                <p className="mt-2 font-heading text-3xl font-semibold tracking-tight text-foreground">
                  {nationalKeyAverage > 0 ? nationalKeyAverage.toFixed(2) : "-"}
                </p>
              </div>
              <div className="rounded-[22px] border border-border/70 bg-background/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Åbne svar</p>
                <p className="mt-2 font-heading text-3xl font-semibold tracking-tight text-foreground">{improvementResponses.length}</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-[22px] border border-border/70 bg-background/85">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-muted/20 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <th className="py-3 pl-4 pr-2">Klub</th>
                    <th className="px-2 py-3">Svar</th>
                    <th className="px-2 py-3">Score</th>
                    <th className="px-4 py-3 text-right">Detalje</th>
                  </tr>
                </thead>
                <tbody>
                  {clubTableRows.map((row) => (
                    <tr key={row.clubId} className="border-b border-border/60 last:border-b-0">
                      <td className="py-3 pl-4 pr-2 font-medium text-foreground">{row.clubName}</td>
                      <td className="px-2 py-3 text-muted-foreground">{row.count}</td>
                      <td className="px-2 py-3">
                        {row.suppressed ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
                            Skjult (&lt;{SUPPRESSION_THRESHOLD})
                          </span>
                        ) : (
                          <span className="font-semibold text-foreground">{row.avg?.toFixed(2)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/dmu/clubs/${row.clubId}`} className="text-sm font-semibold text-primary transition hover:text-primary/80">
                          Åbn
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </article>
      </section>

      <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Spørgsmålsfordeling</h2>
            <p className="mt-1 text-sm text-muted-foreground">Søg og scan benchmarkspørgsmål hurtigt.</p>
          </div>
          <span className="rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground">
            {benchmarkRows.length} spørgsmål
          </span>
        </div>

        <div className="mt-5 rounded-[22px] border border-border/60 bg-background/80 p-4">
          <QuestionDistributionBoard rows={benchmarkRows} suppressionThreshold={SUPPRESSION_THRESHOLD} />
        </div>
      </section>

      {dmuImprovementQuestion ? (
        <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Åbne svar</p>
              <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-foreground">{dmuImprovementQuestion.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Seneste signaler fra klubberne.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground">
                {improvementResponses.length} svar
              </span>
              <TextResponsesModal questionTitle={dmuImprovementQuestion.title} responses={improvementResponses} triggerLabel="Se alle" />
            </div>
          </div>

          {improvementResponses.length > 0 ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              {improvementResponses.slice(0, 3).map((response, index) => (
                <article key={`${response.submittedAt}-${index}`} className="rounded-[22px] border border-border/70 bg-background/85 p-4">
                  <p className="text-sm leading-6 text-foreground">{response.text}</p>
                  <p className="mt-3 text-xs font-medium text-muted-foreground">{response.clubName}</p>
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
