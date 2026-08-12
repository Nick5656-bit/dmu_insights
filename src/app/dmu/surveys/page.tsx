import Link from "next/link";
import { CalendarDays, ClipboardList, SendHorizontal } from "lucide-react";
import { SurveyStatus, SurveyType } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const surveyTypeOptions: { value: SurveyType; label: string }[] = [
  { value: "ANNUAL", label: "Årlig" },
  { value: "EVENT", label: "Arrangement" },
];

const surveyStatusOptions: { value: SurveyStatus; label: string }[] = [
  { value: "DRAFT", label: "Kladde" },
  { value: "SCHEDULED", label: "Planlagt" },
  { value: "SENT", label: "Sendt" },
  { value: "CLOSED", label: "Lukket" },
];

const surveyTypeLabel: Record<SurveyType, string> = {
  ANNUAL: "Årlig",
  EVENT: "Arrangement",
};

const surveyStatusLabel: Record<SurveyStatus, string> = {
  DRAFT: "Kladde",
  SCHEDULED: "Planlagt",
  SENT: "Sendt",
  CLOSED: "Lukket",
};

const surveyStatusTone: Record<SurveyStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-800",
  SCHEDULED: "bg-sky-100 text-sky-900",
  SENT: "bg-emerald-100 text-emerald-900",
  CLOSED: "bg-stone-200 text-stone-900",
};

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

type DmuSurveysPageProps = {
  searchParams: Promise<{ clubId?: string; surveyType?: string; status?: string; from?: string; to?: string }>;
};

export default async function DmuSurveysPage({ searchParams }: DmuSurveysPageProps) {
  await requireRole("DMU_ADMIN");
  const params = await searchParams;

  const clubs = await prisma.club.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  const validClubIds = new Set(clubs.map((club) => club.id));
  const clubIdFilter = params.clubId && validClubIds.has(params.clubId) ? params.clubId : undefined;
  const surveyTypeFilter = surveyTypeOptions.some((option) => option.value === params.surveyType) ? (params.surveyType as SurveyType) : undefined;
  const statusFilter = surveyStatusOptions.some((option) => option.value === params.status) ? (params.status as SurveyStatus) : undefined;

  const fromDate = params.from ? new Date(params.from) : undefined;
  const toDateRaw = params.to ? new Date(params.to) : undefined;
  const validFromDate = fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined;
  const validToDate = toDateRaw && !Number.isNaN(toDateRaw.getTime()) ? new Date(toDateRaw.getTime() + 24 * 60 * 60 * 1000) : undefined;

  const where = {
    ...(clubIdFilter ? { clubId: clubIdFilter } : {}),
    ...(surveyTypeFilter ? { surveyType: surveyTypeFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(validFromDate || validToDate
      ? {
          createdAt: {
            ...(validFromDate ? { gte: validFromDate } : {}),
            ...(validToDate ? { lt: validToDate } : {}),
          },
        }
      : {}),
  };

  const instances = await prisma.surveyInstance.findMany({
    where,
    include: {
      club: { select: { id: true, name: true } },
      _count: {
        select: {
          invitations: true,
          responses: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 250,
  });

  const total = instances.length;
  const draftCount = instances.filter((instance) => instance.status === "DRAFT").length;
  const scheduledCount = instances.filter((instance) => instance.status === "SCHEDULED").length;
  const sentCount = instances.filter((instance) => instance.status === "SENT").length;
  const closedCount = instances.filter((instance) => instance.status === "CLOSED").length;
  const totalInvitations = instances.reduce((sum, instance) => sum + instance._count.invitations, 0);
  const totalResponses = instances.reduce((sum, instance) => sum + instance._count.responses, 0);
  const responseRate = totalInvitations > 0 ? Math.round((totalResponses / totalInvitations) * 100) : 0;

  const summaryCards = [
    { label: "Spørgeskemaer", value: total, hint: "I det valgte udsnit" },
    { label: "Planlagte", value: scheduledCount, hint: "Klar til udsendelse" },
    { label: "Sendte", value: sentCount, hint: `${totalResponses} svar registreret` },
    { label: "Svarrate", value: `${responseRate}%`, hint: `${totalInvitations} invitationer` },
  ];

  const selectedClubName = clubs.find((club) => club.id === clubIdFilter)?.name;
  const activeFilters = [
    selectedClubName ? `Klub: ${selectedClubName}` : null,
    surveyTypeFilter ? `Type: ${surveyTypeLabel[surveyTypeFilter]}` : null,
    statusFilter ? `Status: ${surveyStatusLabel[statusFilter]}` : null,
    validFromDate ? `Fra: ${formatDate(validFromDate)}` : null,
    params.to && validToDate ? `Til: ${formatDate(new Date(validToDate.getTime() - 24 * 60 * 60 * 1000))}` : null,
  ].filter(Boolean) as string[];

  const statusPills = [
    { label: "Kladder", value: draftCount },
    { label: "Planlagte", value: scheduledCount },
    { label: "Sendte", value: sentCount },
    { label: "Lukkede", value: closedCount },
  ];

  return (
    <div className="space-y-6">
      <section className="overflow-visible rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl space-y-4">
            <span className="inline-flex w-fit items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/90">
              Spørgeskemaer
            </span>
            <div className="space-y-2 text-white/75 [&_h1]:text-white [&_p]:text-white/75">
              <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Overblik på tværs af klubber</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">Filtrér og følg status på alle spørgeskemaer ét sted.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeFilters.length > 0 ? (
                activeFilters.map((filter) => (
                  <span
                    key={filter}
                    className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/85"
                  >
                    {filter}
                  </span>
                ))
              ) : (
                <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/85">
                  Alle klubber og alle statusser
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/dmu/outbox"
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:bg-primary/90"
            >
              <SendHorizontal className="h-4 w-4" />
              Udsendelser
            </Link>
            <Link
              href="/dmu/events"
              className="inline-flex h-11 items-center rounded-2xl border border-white/15 bg-white/10 px-5 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-white/16"
            >
              Arrangementer
            </Link>
          </div>
        </div>

        <form className="mt-6 grid gap-3 rounded-[24px] border border-white/12 bg-white/8 p-4 backdrop-blur-sm md:grid-cols-5" method="get">
          <select name="clubId" defaultValue={clubIdFilter ?? ""} className="h-11 rounded-2xl border border-white/12 bg-white/96 px-3 text-sm text-foreground">
            <option value="">Alle klubber</option>
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
              </option>
            ))}
          </select>

          <select name="surveyType" defaultValue={surveyTypeFilter ?? ""} className="h-11 rounded-2xl border border-white/12 bg-white/96 px-3 text-sm text-foreground">
            <option value="">Alle typer</option>
            {surveyTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select name="status" defaultValue={statusFilter ?? ""} className="h-11 rounded-2xl border border-white/12 bg-white/96 px-3 text-sm text-foreground">
            <option value="">Alle statusser</option>
            {surveyStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <input type="date" name="from" defaultValue={params.from ?? ""} className="h-11 rounded-2xl border border-white/12 bg-white/96 px-3 text-sm text-foreground" />
          <input type="date" name="to" defaultValue={params.to ?? ""} className="h-11 rounded-2xl border border-white/12 bg-white/96 px-3 text-sm text-foreground" />

          <div className="flex gap-3 md:col-span-5">
            <button
              type="submit"
              className="h-11 rounded-2xl bg-white px-5 text-sm font-semibold text-primary shadow-sm transition hover:-translate-y-0.5 hover:bg-white/92"
            >
              Opdater
            </button>
            <Link
              href="/dmu/surveys"
              className="flex h-11 items-center justify-center rounded-2xl border border-white/15 px-5 text-sm font-medium text-white/85 transition hover:bg-white/10"
            >
              Nulstil
            </Link>
          </div>
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

      <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Seneste spørgeskemaer</h2>
            <p className="mt-1 text-sm text-muted-foreground">De seneste 250 spørgeskemaer i det valgte udsnit.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {statusPills.map((item) => (
              <span
                key={item.label}
                className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground"
              >
                <span>{item.label}</span>
                <span className="font-semibold text-foreground">{item.value}</span>
              </span>
            ))}
          </div>
        </div>

        {instances.length > 0 ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {instances.map((instance) => {
              const invitationCount = instance._count.invitations;
              const responseCount = instance._count.responses;
              const rate = invitationCount > 0 ? Math.round((responseCount / invitationCount) * 100) : 0;
              const TypeIcon = instance.surveyType === "EVENT" ? CalendarDays : ClipboardList;
              const accentClass = instance.surveyType === "EVENT" ? "bg-sky-50 text-sky-700" : "bg-emerald-50 text-emerald-700";

              return (
                <article key={instance.id} className="rounded-[24px] border border-border/70 bg-background/90 p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`inline-flex rounded-2xl p-3 ${accentClass}`}>
                        <TypeIcon className="h-5 w-5" />
                      </div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-foreground">{instance.name}</h3>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${surveyStatusTone[instance.status]}`}>
                            {surveyStatusLabel[instance.status]}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{instance.club.name}</p>
                      </div>
                    </div>
                    <span className="rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground">
                      {surveyTypeLabel[instance.surveyType]}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Invitationer</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{invitationCount}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Svar</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{responseCount}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Svarrate</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{rate}%</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Sendt</p>
                      <p className="mt-2 text-sm font-semibold text-foreground">{formatDate(instance.sentAt)}</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Responseniveau</span>
                      <span>{responseCount} af {invitationCount || 0}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted/60">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(rate, 100)}%` }} />
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>Oprettet {formatDate(instance.createdAt)}</p>
                      <p>Senest aktivitet {formatDate(instance.updatedAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href="/dmu/outbox"
                        className="inline-flex h-11 items-center rounded-2xl border border-border/70 px-4 text-sm font-semibold text-foreground transition hover:bg-muted/40"
                      >
                        Udsendelser
                      </Link>
                      {instance.eventId ? (
                        <Link
                          href="/dmu/events"
                          className="inline-flex h-11 items-center rounded-2xl border border-border/70 px-4 text-sm font-semibold text-foreground transition hover:bg-muted/40"
                        >
                          Arrangement
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-[22px] border border-dashed border-border/70 bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground">
            Ingen spørgeskemaer matcher filtrene.
          </div>
        )}
      </section>
    </div>
  );
}
