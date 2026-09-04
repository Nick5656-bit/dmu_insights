import { SurveyType } from "@prisma/client";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { ClubMultiSelectFilter } from "@/components/club-multi-select-filter";
import { DmuDeliveryTabs } from "@/components/dmu-delivery-tabs";
import { processDueScheduledSends } from "@/lib/scheduled-sends";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SubmitButton } from "@/components/submit-button";

type DmuOutboxPageProps = {
  searchParams: Promise<{
    clubIds?: string | string[];
    surveyType?: string;
    show?: string;
  }>;
};

function parseClubIds(rawValue: string | string[] | undefined): string[] {
  if (!rawValue) {
    return [];
  }

  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  return [...new Set(values.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean))];
}

export default async function DmuOutboxPage({ searchParams }: DmuOutboxPageProps) {
  await requireRole("DMU_ADMIN");
  const now = new Date();
  const eligibleDueWhere = {
    status: "PENDING" as const,
    sendAt: { lte: now },
    surveyInstance: {
      OR: [
        { surveyType: { not: "EVENT" as const } },
        { clubReadyAt: { not: null } },
      ],
    },
  };
  const params = await searchParams;
  const shouldShowDetails = params.show === "1";
  const selectedClubIds = parseClubIds(params.clubIds);
  const canFetchDetails = shouldShowDetails && selectedClubIds.length > 0;
  const surveyTypeFilter = params.surveyType === "ANNUAL" || params.surveyType === "EVENT" ? (params.surveyType as SurveyType) : undefined;

  const [clubs, totalSurveyInstances, sentCount, answeredCount, pendingCount, dueCount, dueScheduledSends] = await Promise.all([
    prisma.club.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
    prisma.surveyInstance.count({
      where: {
        invitations: {
          some: {},
        },
      },
    }),
    prisma.surveyInvitation.count({ where: { status: "SENT" } }),
    prisma.surveyInvitation.count({ where: { status: "ANSWERED" } }),
    prisma.scheduledSend.count({ where: { status: "PENDING" } }),
    prisma.scheduledSend.count({ where: eligibleDueWhere }),
    prisma.scheduledSend.findMany({
      where: eligibleDueWhere,
      include: {
        surveyInstance: {
          include: {
            club: true,
          },
        },
      },
      orderBy: { sendAt: "asc" },
    }),
  ]);

  let instancesWithCounts: Array<{
    id: string;
    name: string;
    surveyType: SurveyType;
    createdAt: Date;
    club: { id: string; name: string };
    _count: { invitations: number };
    answeredCount: number;
    sentAt?: Date;
  }> = [];

  if (canFetchDetails) {
    const surveyInstancesWithStats = await prisma.surveyInstance.findMany({
      where: {
        invitations: {
          some: {},
        },
        ...(selectedClubIds.length > 0 ? { clubId: { in: selectedClubIds } } : {}),
        ...(surveyTypeFilter ? { surveyType: surveyTypeFilter } : {}),
      },
      include: {
        club: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            invitations: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    instancesWithCounts = await Promise.all(
      surveyInstancesWithStats.map(async (instance) => {
        const [answeredCountForInstance, sentAt] = await Promise.all([
          prisma.surveyInvitation.count({
            where: {
              surveyInstanceId: instance.id,
              status: "ANSWERED",
            },
          }),
          prisma.mailLog.findFirst({
            where: {
              surveyInvitation: {
                surveyInstanceId: instance.id,
              },
            },
            select: { sentAt: true },
            orderBy: { sentAt: "asc" },
          }),
        ]);

        return {
          ...instance,
          answeredCount: answeredCountForInstance,
          sentAt: sentAt?.sentAt,
        };
      })
    );
  }

  async function processScheduledSendsAction(formData: FormData) {
    "use server";
    await requireRole("DMU_ADMIN");

    const selectedScheduledSendIds = formData
      .getAll("scheduledSendIds")
      .map((value) => String(value))
      .filter(Boolean);

    if (selectedScheduledSendIds.length === 0) {
      return;
    }

    await processDueScheduledSends(selectedScheduledSendIds);

    revalidatePath("/dmu/settings/sends");
    revalidatePath("/dmu/calendar");
    revalidatePath("/club/outbox");
    revalidatePath("/club/events");
  }

  const hasActiveFilters = Boolean(selectedClubIds.length > 0 || surveyTypeFilter);
  const selectedClubs = clubs.filter((club) => selectedClubIds.includes(club.id));

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)] [&_p.text-muted-foreground]:text-white/75 [&_article]:rounded-[22px] [&_article]:border-white/12 [&_article]:bg-white/10">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Udsendelser</p>
            <h2 className="mt-2 text-2xl font-bold">Oversigt</h2>
            <p className="mt-1 text-sm text-muted-foreground">Klar nu, planlagt og sendt.</p>
          </div>
          <DmuDeliveryTabs variant="dark" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Udsendelser</p>
            <p className="text-lg font-semibold">{totalSurveyInstances}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Sendte invitationer</p>
            <p className="text-lg font-semibold">{sentCount}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Besvarede invitationer</p>
            <p className="text-lg font-semibold">{answeredCount}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Planlagte udsendelser</p>
            <p className="text-lg font-semibold">{pendingCount}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Klar til afsendelse nu</p>
            <p className="text-lg font-semibold">{dueCount}</p>
          </article>
        </div>

        <div className="mt-4 rounded-lg border bg-muted/20 p-4">
          <h3 className="text-sm font-semibold">Klar nu</h3>

          {dueScheduledSends.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Ingen planlagte udsendelser er klar endnu.</p>
          ) : (
            <form action={processScheduledSendsAction} className="mt-3 space-y-3">
              <div className="space-y-2">
                {dueScheduledSends.map((scheduledSend) => (
                  <label
                    key={scheduledSend.id}
                    className="flex items-start gap-3 rounded-md border bg-background p-3 text-sm hover:bg-muted/30"
                  >
                    <input
                      type="checkbox"
                      name="scheduledSendIds"
                      value={scheduledSend.id}
                      className="mt-0.5 h-4 w-4"
                      defaultChecked
                    />
                    <span className="leading-5">
                      <span className="font-medium">{scheduledSend.surveyInstance.club.name}</span>
                      <span className="ml-1">· {scheduledSend.surveyInstance.name}</span>
                      <span className="ml-1 text-muted-foreground">
                        ({new Intl.DateTimeFormat("da-DK", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(scheduledSend.sendAt)})
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              <SubmitButton pendingText="Sender..." className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                Behandl valgte udsendelser
              </SubmitButton>
            </form>
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">Filtre</h3>
          </div>
        </div>

        <form method="get" className="mt-4 grid gap-3 md:grid-cols-3">
          <input type="hidden" name="show" value="1" />

          <ClubMultiSelectFilter clubs={clubs} initialSelectedIds={selectedClubIds} />

          <select
            name="surveyType"
            defaultValue={surveyTypeFilter ?? ""}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Alle surveytyper</option>
            <option value="ANNUAL">Årlig måling</option>
            <option value="EVENT">Event-feedback</option>
          </select>

          <div className="flex gap-3">
            <button type="submit" className="h-10 flex-1 rounded-md bg-foreground px-4 text-sm font-medium text-background hover:bg-foreground/80">
              Vis udsendelser
            </button>
            {(shouldShowDetails || hasActiveFilters) && (
              <Link href="/dmu/settings/sends" className="flex h-10 items-center justify-center rounded-md border px-4 text-sm text-muted-foreground hover:bg-muted">
                Nulstil
              </Link>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Udsendelser pr. spørgeskema</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {selectedClubs.length > 0 ? `${selectedClubs.length} klubber valgt. ` : ""}
          {surveyTypeFilter ? `${surveyTypeFilter === "ANNUAL" ? "Årlig måling" : "Event-feedback"}. ` : ""}
          Op til 100 rækker.
        </p>
        <div className="mt-4 space-y-3">
          {!shouldShowDetails ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Vælg filtre og hent listen.
            </div>
          ) : !canFetchDetails ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Vælg mindst én klub.
            </div>
          ) : instancesWithCounts.length > 0 ? (
            instancesWithCounts.map((instance) => (
              <article key={instance.id} className="rounded-lg border p-4 hover:bg-muted/30 transition-colors">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{instance.club.name}</p>
                    <p className="text-sm text-muted-foreground mt-1">{instance.name}</p>
                    <p className="text-xs text-muted-foreground mt-2">{instance.surveyType === "ANNUAL" ? "Årlig måling" : "Event-feedback"}</p>
                    {instance.sentAt && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Sendt: {new Intl.DateTimeFormat("da-DK", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(instance.sentAt)}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-6 items-center">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Sendt til</p>
                      <p className="text-lg font-semibold">{instance._count.invitations}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Besvaret</p>
                      <p className="text-lg font-semibold text-green-600">{instance.answeredCount}</p>
                    </div>
                    <Link
                      href={`/dmu/settings/sends/${instance.id}`}
                      className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted whitespace-nowrap"
                    >
                      Se mails →
                    </Link>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Ingen udsendelser fundet for de valgte filtre.</p>
          )}
        </div>
      </section>
    </div>
  );
}
