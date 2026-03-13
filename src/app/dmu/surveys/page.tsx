import Link from "next/link";
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

type DmuSurveysPageProps = {
  searchParams: Promise<{ clubId?: string; surveyType?: string; status?: string; from?: string; to?: string }>;
};

export default async function DmuSurveysPage({ searchParams }: DmuSurveysPageProps) {
  await requireRole("DMU_ADMIN");
  const params = await searchParams;

  const [clubs, clubsForFilter] = await Promise.all([
    prisma.club.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.club.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const validClubIds = new Set(clubsForFilter.map((club) => club.id));
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
    orderBy: { createdAt: "desc" },
    take: 250,
  });

  const total = instances.length;
  const draftCount = instances.filter((instance) => instance.status === "DRAFT").length;
  const scheduledCount = instances.filter((instance) => instance.status === "SCHEDULED").length;
  const sentCount = instances.filter((instance) => instance.status === "SENT").length;
  const closedCount = instances.filter((instance) => instance.status === "CLOSED").length;
  const activeCount = instances.filter((instance) => instance.status !== "CLOSED").length;
  const totalInvitations = instances.reduce((sum, instance) => sum + instance._count.invitations, 0);
  const totalResponses = instances.reduce((sum, instance) => sum + instance._count.responses, 0);
  const responseRate = totalInvitations > 0 ? (totalResponses / totalInvitations) * 100 : 0;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">DMU-spørgeskemaer</h2>
        <p className="mt-2 text-sm text-muted-foreground">Tværgående overblik over spørgeskemaer, status og svarprocenter på tværs af klubber.</p>

        <form className="mt-4 grid gap-3 md:grid-cols-5" method="get">
          <select name="clubId" defaultValue={clubIdFilter ?? ""} className="rounded-md border px-3 py-2 text-sm">
            <option value="">Alle klubber</option>
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
              </option>
            ))}
          </select>

          <select name="surveyType" defaultValue={surveyTypeFilter ?? ""} className="rounded-md border px-3 py-2 text-sm">
            <option value="">Alle typer</option>
            {surveyTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select name="status" defaultValue={statusFilter ?? ""} className="rounded-md border px-3 py-2 text-sm">
            <option value="">Alle statusser</option>
            {surveyStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <input type="date" name="from" defaultValue={params.from ?? ""} className="rounded-md border px-3 py-2 text-sm" />
          <input type="date" name="to" defaultValue={params.to ?? ""} className="rounded-md border px-3 py-2 text-sm" />

          <div className="md:col-span-5 flex gap-2">
            <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Anvend filtre
            </button>
            <Link href="/dmu/surveys" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
              Nulstil
            </Link>
          </div>
        </form>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">I alt</p>
          <p className="mt-1 text-2xl font-semibold">{total}</p>
        </article>
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Aktive</p>
          <p className="mt-1 text-2xl font-semibold">{activeCount}</p>
        </article>
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Kladder</p>
          <p className="mt-1 text-2xl font-semibold">{draftCount}</p>
        </article>
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Planlagte</p>
          <p className="mt-1 text-2xl font-semibold">{scheduledCount}</p>
        </article>
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Sendte</p>
          <p className="mt-1 text-2xl font-semibold">{sentCount}</p>
        </article>
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Lukkede</p>
          <p className="mt-1 text-2xl font-semibold">{closedCount}</p>
        </article>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Invitationer</p>
            <p className="text-lg font-semibold">{totalInvitations}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Svar</p>
            <p className="text-lg font-semibold">{totalResponses}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Svarprocent</p>
            <p className="text-lg font-semibold">{responseRate.toFixed(1)}%</p>
          </article>
        </div>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Spørgeskema</th>
                <th className="py-2 pr-4">Klub</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Invitationer</th>
                <th className="py-2 pr-4">Svar</th>
                <th className="py-2 pr-4">Svarprocent</th>
                <th className="py-2 pr-4">Oprettet</th>
                <th className="py-2 pr-4">Sendt</th>
                <th className="py-2">Handlinger</th>
              </tr>
            </thead>
            <tbody>
              {instances.map((instance) => {
                const invitationCount = instance._count.invitations;
                const responseCount = instance._count.responses;
                const rate = invitationCount > 0 ? (responseCount / invitationCount) * 100 : 0;

                return (
                  <tr key={instance.id} className="border-b align-top">
                    <td className="py-2 pr-4 font-medium">{instance.name}</td>
                    <td className="py-2 pr-4">{instance.club.name}</td>
                    <td className="py-2 pr-4">{surveyTypeLabel[instance.surveyType]}</td>
                    <td className="py-2 pr-4">{surveyStatusLabel[instance.status]}</td>
                    <td className="py-2 pr-4">{invitationCount}</td>
                    <td className="py-2 pr-4">{responseCount}</td>
                    <td className="py-2 pr-4">{rate.toFixed(1)}%</td>
                    <td className="py-2 pr-4 text-muted-foreground">{new Date(instance.createdAt).toLocaleDateString("da-DK")}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{instance.sentAt ? new Date(instance.sentAt).toLocaleDateString("da-DK") : "-"}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/dmu/clubs/${instance.club.id}`} className="text-primary underline">
                          Åbn klub
                        </Link>
                        <Link href="/dmu/outbox" className="text-primary underline">
                          Udsendelser
                        </Link>
                        {instance.eventId ? (
                          <Link href="/dmu/events" className="text-primary underline">
                            Arrangement
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {instances.length === 0 ? <p className="text-sm text-muted-foreground">Ingen spørgeskemaer matcher de valgte filtre.</p> : null}
        </div>
      </section>
    </div>
  );
}
