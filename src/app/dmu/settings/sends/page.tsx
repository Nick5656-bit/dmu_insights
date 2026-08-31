import Link from "next/link";
import { SurveyType } from "@prisma/client";
import { ClubMultiSelectFilter } from "@/components/club-multi-select-filter";
import { DmuDeliveryTabs } from "@/components/dmu-delivery-tabs";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Props = {
  searchParams: Promise<{
    clubIds?: string | string[];
    surveyType?: string;
    show?: string;
  }>;
};

function parseClubIds(rawValue: string | string[] | undefined): string[] {
  if (!rawValue) return [];
  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  return [...new Set(values.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean))];
}

export default async function TidligereUdsendelsePage({ searchParams }: Props) {
  await requireRole("DMU_ADMIN");
  const params = await searchParams;

  const selectedClubIds = parseClubIds(params.clubIds);
  const surveyTypeFilter =
    params.surveyType === "ANNUAL" || params.surveyType === "EVENT"
      ? (params.surveyType as SurveyType)
      : undefined;
  const shouldShow = params.show === "1";

  const clubs = await prisma.club.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  const [totalSent, totalAnswered] = await Promise.all([
    prisma.surveyInvitation.count({ where: { status: "SENT" } }),
    prisma.surveyInvitation.count({ where: { status: "ANSWERED" } }),
  ]);

  let instances: Array<{
    id: string;
    name: string;
    surveyType: SurveyType;
    club: { id: string; name: string };
    invitationCount: number;
    answeredCount: number;
    sentAt?: Date;
  }> = [];

  if (shouldShow && selectedClubIds.length > 0) {
    const raw = await prisma.surveyInstance.findMany({
      where: {
        invitations: { some: {} },
        clubId: { in: selectedClubIds },
        ...(surveyTypeFilter ? { surveyType: surveyTypeFilter } : {}),
      },
      include: {
        club: { select: { id: true, name: true } },
        _count: { select: { invitations: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    instances = await Promise.all(
      raw.map(async (instance) => {
        const [answeredCount, firstMail] = await Promise.all([
          prisma.surveyInvitation.count({
            where: { surveyInstanceId: instance.id, status: "ANSWERED" },
          }),
          prisma.mailLog.findFirst({
            where: { surveyInvitation: { surveyInstanceId: instance.id } },
            select: { sentAt: true },
            orderBy: { sentAt: "asc" },
          }),
        ]);
        return {
          id: instance.id,
          name: instance.name,
          surveyType: instance.surveyType,
          club: instance.club,
          invitationCount: instance._count.invitations,
          answeredCount,
          sentAt: firstMail?.sentAt,
        };
      })
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
              Indstillinger
            </p>
            <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-white">
              Tidligere udsendelser
            </h1>
            <p className="mt-2 text-sm text-white/70">
              Overblik over afsluttede og igangværende spørgeskema-udsendelser.
            </p>
          </div>
          <DmuDeliveryTabs variant="dark" />
        </div>

        {/* Stat-kort */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[22px] border border-white/12 bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              Sendte invitationer
            </p>
            <p className="mt-2 font-heading text-3xl font-semibold text-white">{totalSent}</p>
            <p className="mt-1 text-sm text-white/60">På tværs af alle udsendelser</p>
          </div>
          <div className="rounded-[22px] border border-white/12 bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              Besvarede invitationer
            </p>
            <p className="mt-2 font-heading text-3xl font-semibold text-white">{totalAnswered}</p>
            <p className="mt-1 text-sm text-white/60">
              {totalSent > 0
                ? `${Math.round((totalAnswered / totalSent) * 100)}% svarprocent`
                : "Ingen sendt endnu"}
            </p>
          </div>
        </div>
      </section>

      {/* Søg i historik */}
      <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
        <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          Søg i udsendelser
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Vælg klub for at se detaljeret historik.
        </p>

        <form method="get" className="mt-5 grid gap-3 md:grid-cols-3">
          <input type="hidden" name="show" value="1" />
          <ClubMultiSelectFilter clubs={clubs} initialSelectedIds={selectedClubIds} />
          <div className="relative">
            <select
              name="surveyType"
              defaultValue={surveyTypeFilter ?? ""}
              className="h-11 w-full appearance-none rounded-2xl border border-border/70 bg-background/95 pl-3 pr-8 text-sm text-foreground"
            >
              <option value="">Alle typer</option>
              <option value="ANNUAL">Årlig måling</option>
              <option value="EVENT">Event-feedback</option>
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              ▾
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="h-11 flex-1 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Vis udsendelser
            </button>
            {(shouldShow || selectedClubIds.length > 0 || surveyTypeFilter) && (
              <Link
                href="/dmu/settings/sends"
                className="flex h-11 items-center justify-center rounded-2xl border border-border/70 px-4 text-sm font-medium text-muted-foreground transition hover:bg-muted/20"
              >
                Nulstil
              </Link>
            )}
          </div>
        </form>

        <div className="mt-5 space-y-3">
          {!shouldShow ? (
            <div className="rounded-[22px] border border-dashed border-border/70 bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground">
              Vælg mindst én klub og tryk "Vis udsendelser".
            </div>
          ) : selectedClubIds.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-border/70 bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground">
              Vælg mindst én klub for at se udsendelser.
            </div>
          ) : instances.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-border/70 bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground">
              Ingen udsendelser fundet for de valgte filtre.
            </div>
          ) : (
            instances.map((instance) => (
              <article
                key={instance.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-border/70 bg-background/80 p-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{instance.club.name}</p>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{instance.name}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full border border-border/60 bg-muted/20 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {instance.surveyType === "ANNUAL" ? "Årlig måling" : "Event-feedback"}
                    </span>
                    {instance.sentAt && (
                      <span className="rounded-full border border-border/60 bg-muted/20 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        Sendt{" "}
                        {new Intl.DateTimeFormat("da-DK", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        }).format(instance.sentAt)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Invitationer</p>
                    <p className="mt-0.5 text-xl font-semibold text-foreground">
                      {instance.invitationCount}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Besvarede</p>
                    <p className="mt-0.5 text-xl font-semibold text-green-600">
                      {instance.answeredCount}
                    </p>
                  </div>
                  <Link
                    href={`/dmu/settings/sends/${instance.id}`}
                    className="rounded-2xl border border-border/70 px-4 py-2 text-sm font-medium transition hover:bg-muted/20"
                  >
                    Se mails →
                  </Link>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
