import Link from "next/link";
import { AgeGroup, MemberRole, RaceClass } from "@prisma/client";
import { ClubComparisonChart } from "@/components/charts/benchmark-bar-chart";
import { GettingStartedWizard } from "@/components/getting-started-wizard";
import { NextActionPanel } from "@/components/next-action-panel";
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

type DmuDashboardProps = {
  searchParams: Promise<{ ageGroup?: string; raceClass?: string; memberRole?: string; surveyTemplateId?: string }>;
};

export default async function DmuDashboardPage({ searchParams }: DmuDashboardProps) {
  await requireRole("DMU_ADMIN");
  const params = await searchParams;

  const availableTemplates = await prisma.surveyTemplate.findMany({
    where: {
      surveyInstances: {
        some: {},
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
          where: { surveyTemplateId: selectedTemplate.id },
          select: { id: true },
        })
      ).map((instance) => instance.id)
    : [];

  const ageGroupFilter = ageGroupOptions.some((option) => option.value === params.ageGroup) ? (params.ageGroup as AgeGroup) : undefined;
  const raceClassFilter = raceClassOptions.some((option) => option.value === params.raceClass) ? (params.raceClass as RaceClass) : undefined;
  const memberRoleFilter = memberRoleOptions.some((option) => option.value === params.memberRole) ? (params.memberRole as MemberRole) : undefined;

  const responseWhere = {
    ...(selectedTemplate ? { surveyInstanceId: { in: selectedTemplateInstanceIds } } : {}),
    ...(ageGroupFilter ? { ageGroup: ageGroupFilter } : {}),
    ...(raceClassFilter ? { raceClass: raceClassFilter } : {}),
    ...(memberRoleFilter ? { memberRole: memberRoleFilter } : {}),
  };

  const [clubCount, memberCount, surveyCount, eventCount, totalResponses, standardQuestionCount, templateCount, pendingSendCount, clubs, benchmarkQuestions] = await Promise.all([
    prisma.club.count({ where: { active: true } }),
    prisma.member.count({ where: { active: true } }),
    prisma.surveyInstance.count(),
    prisma.event.count(),
    prisma.surveyResponse.count({ where: responseWhere }),
    prisma.question.count({ where: { scope: "DMU_STANDARD", active: true } }),
    prisma.surveyTemplate.count({ where: { isActive: true } }),
    prisma.scheduledSend.count({ where: { status: "PENDING" } }),
    prisma.club.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
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

  const nextAction =
    standardQuestionCount === 0
      ? {
          eyebrow: "Næste handling",
          title: "Start med at oprette standardspørgsmål",
          description: "Klubberne kan først bruge systemet, når DMU har oprettet de centrale spørgsmål, som skabelonerne skal bygges af.",
          primaryLabel: "Opret standardspørgsmål",
          primaryHref: "/dmu/questions",
          secondaryLabel: "Se guiden",
          secondaryHref: "/dmu/dashboard",
        }
      : templateCount === 0
        ? {
            eyebrow: "Næste handling",
            title: "Byg den første skabelon",
            description: "Når spørgsmålene er på plads, er næste skridt at samle dem i en skabelon, som klubberne kan genbruge.",
            primaryLabel: "Opret skabelon",
            primaryHref: "/dmu/templates",
            secondaryLabel: "Se standardspørgsmål",
            secondaryHref: "/dmu/questions",
          }
        : pendingSendCount > 0
          ? {
              eyebrow: "Næste handling",
              title: "Der er planlagte udsendelser, som venter",
              description: "Mindst én udsendelse er klar eller planlagt. Gå til udsendelser og behandl dem, så klubber og medlemmer modtager spørgeskemaerne.",
              primaryLabel: "Gå til udsendelser",
              primaryHref: "/dmu/outbox",
              secondaryLabel: "Se arrangementer",
              secondaryHref: "/dmu/events",
            }
          : {
              eyebrow: "Næste handling",
              title: "Følg op på brugen i klubberne",
              description: "Opsætningen er på plads. Brug nu overblikket til at følge aktivitet, udsendelser og svar på tværs af klubber.",
              primaryLabel: "Åbn spørgeskemaoverblik",
              primaryHref: "/dmu/surveys",
              secondaryLabel: "Se klubindsigter",
              secondaryHref: "/dmu/dashboard",
            };

  const keyQuestion = benchmarkQuestions[0];
  const clubComparisonRows: { label: string; own: number; benchmark: number }[] = [];
  const clubTableRows: { clubId: string; clubName: string; count: number; avg: number | null; suppressed: boolean }[] = [];

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

    for (const club of clubs) {
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
        label: club.name.length > 20 ? `${club.name.slice(0, 20)}…` : club.name,
        own: clubAvg,
        benchmark: nationalKeyAverage,
      });
    }
  }

  // Fetch DMU improvement text responses across all clubs
  const dmuImprovementQuestion = await prisma.question.findFirst({
    where: { benchmarkKey: "DMU_CENTRAL_IMPROVEMENT", scope: "DMU_STANDARD" },
  });

  const dmuImprovementAnswers = dmuImprovementQuestion
    ? await prisma.surveyAnswer.findMany({
        where: { questionId: dmuImprovementQuestion.id, textValue: { not: null } },
        include: {
          surveyResponse: {
            select: { submittedAt: true, clubId: true },
          },
        },
        orderBy: { surveyResponse: { submittedAt: "desc" } },
      })
    : [];

  // Attach club name to each answer
  const improvementResponses = dmuImprovementAnswers.map((a) => ({
    text: a.textValue!,
    clubName: clubs.find((c) => c.id === a.surveyResponse.clubId)?.name ?? "Ukendt klub",
    submittedAt: a.surveyResponse.submittedAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">DMU-overblik</h2>
        <p className="mt-2 text-sm text-muted-foreground">Tværgående sammenligning og konkrete klubindsigter.</p>

        <form className="mt-4 grid gap-3 md:grid-cols-5" method="get">
          <select name="surveyTemplateId" defaultValue={selectedTemplate?.id ?? ""} className="rounded-md border px-3 py-2 text-sm">
            <option value="">Alle spørgeskema-skabeloner</option>
            {availableTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({template.surveyType.toLowerCase()} · {template._count.surveyInstances} udsendelser)
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
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Aktive klubber</p>
          <p className="mt-1 text-2xl font-semibold">{clubCount}</p>
        </article>
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Aktive medlemmer</p>
          <p className="mt-1 text-2xl font-semibold">{memberCount}</p>
        </article>
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Spørgeskemaer</p>
          <p className="mt-1 text-2xl font-semibold">{surveyCount}</p>
        </article>
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Arrangementer</p>
          <p className="mt-1 text-2xl font-semibold">{eventCount}</p>
        </article>
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Filtrerede svar</p>
          <p className="mt-1 text-2xl font-semibold">{totalResponses}</p>
        </article>
      </section>

      <NextActionPanel {...nextAction} />

      {/* DMU text question tile */}
      {dmuImprovementQuestion && (
        <section className="rounded-xl border bg-background p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Åbent spørgsmål · DMU standard</p>
              <h3 className="mt-1 text-base font-semibold">{dmuImprovementQuestion.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {improvementResponses.length} besvarelse{improvementResponses.length !== 1 ? "r" : ""} på tværs af alle klubber.
              </p>
            </div>
            <TextResponsesModal
              questionTitle={dmuImprovementQuestion.title}
              responses={improvementResponses}
              triggerLabel="Se besvarelser fra alle klubber"
            />
          </div>
          {/* Preview of 3 most recent */}
          {improvementResponses.length > 0 && (
            <div className="mt-4 space-y-2">
              {improvementResponses.slice(0, 3).map((r, i) => (
                <div key={i} className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
                  <p className="text-sm">{r.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-medium">{r.clubName}</span>
                  </p>
                </div>
              ))}
              {improvementResponses.length > 3 && (
                <p className="text-xs text-muted-foreground pl-1">
                  + {improvementResponses.length - 3} flere besvarelser — åbn popup for at se alle.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <GettingStartedWizard
        title="Kom i gang (valgfri guide)"
        subtitle="Brug guiden som ny bruger, eller gå direkte til indstillinger i hvert trin."
        steps={[
          {
            id: 1,
            title: "Opret standardspørgsmål",
            description: "Definér de centrale spørgsmål, klubberne skal kunne bruge.",
            primaryCtaLabel: "Start trin 1",
            primaryHref: "/dmu/questions",
            settingsHref: "/dmu/questions",
          },
          {
            id: 2,
            title: "Byg spørgeskema-skabelon",
            description: "Saml spørgsmål i en godkendt skabelon til årlige målinger eller arrangementer.",
            primaryCtaLabel: "Start trin 2",
            primaryHref: "/dmu/templates",
            settingsHref: "/dmu/templates",
          },
          {
            id: 3,
            title: "Udsend og følg op",
            description: "Overvåg udsendelser, og følg svar på tværs af klubber.",
            primaryCtaLabel: "Start trin 3",
            primaryHref: "/dmu/surveys",
            settingsHref: "/dmu/outbox",
          },
        ]}
      />

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Spørgsmålsfordeling</h3>
        <p className="text-sm text-muted-foreground">
          {selectedTemplate ? `Valgt skabelon: ${selectedTemplate.name}. ` : ""}Fordeling af svar på skala 1-5, grupperet efter kategori.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {benchmarkRows.map((row) => (
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

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Klubsammenligning</h3>
        <p className="text-sm text-muted-foreground">
          {selectedTemplate ? `Sammenligning for skabelonen ${selectedTemplate.name}. ` : ""}Konkret klubvisning er kun synlig for DMU admin.
        </p>

        {clubComparisonRows.length > 0 ? <ClubComparisonChart data={clubComparisonRows} /> : <p className="mt-3 text-sm text-muted-foreground">For få data til graf.</p>}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Klub</th>
                <th className="py-2 pr-4">Svar</th>
                <th className="py-2 pr-4">Score</th>
                <th className="py-2">Detalje</th>
              </tr>
            </thead>
            <tbody>
              {clubTableRows.map((row) => (
                <tr key={row.clubId} className="border-b">
                  <td className="py-2 pr-4">{row.clubName}</td>
                  <td className="py-2 pr-4">{row.count}</td>
                  <td className="py-2 pr-4">{row.suppressed ? `Skjult (<${SUPPRESSION_THRESHOLD})` : row.avg?.toFixed(2)}</td>
                  <td className="py-2">
                    <Link href={`/dmu/clubs/${row.clubId}`} className="text-primary underline">
                      Åbn klub
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
