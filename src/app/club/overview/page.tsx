import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { GettingStartedWizard } from "@/components/getting-started-wizard";
import { NextActionPanel } from "@/components/next-action-panel";
import { prisma } from "@/lib/prisma";

export default async function ClubOverviewPage() {
  const session = await requireRole("CLUB_ADMIN");

  if (!session.clubId) {
    return (
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">Kluboverblik</h2>
        <p className="mt-2 text-sm text-muted-foreground">Brugeren mangler klubtilknytning.</p>
      </section>
    );
  }

  const [members, surveys, responses, latestSurvey, pendingSendCount] = await Promise.all([
    prisma.member.count({ where: { clubId: session.clubId, active: true } }),
    prisma.surveyInstance.count({ where: { clubId: session.clubId } }),
    prisma.surveyResponse.count({ where: { clubId: session.clubId } }),
    prisma.surveyInstance.findFirst({
      where: { clubId: session.clubId },
      select: {
        id: true,
        name: true,
        status: true,
        sentAt: true,
        _count: {
          select: {
            responses: true,
            invitations: true,
          },
        },
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
  ]);

  const responseCoverage = members > 0 ? Math.min((responses / members) * 100, 100) : 0;

  const nextAction =
    surveys === 0
      ? {
          eyebrow: "Næste handling",
          title: "Opret klubbens første spørgeskema",
          description: "Start med at vælge en DMU-skabelon. Du kan altid tilføje egne spørgsmål bagefter.",
          primaryLabel: "Opret spørgeskema",
          primaryHref: "/club/surveys",
          secondaryLabel: "Se dashboard",
          secondaryHref: "/club/dashboard",
        }
      : latestSurvey?.status === "DRAFT"
        ? {
            eyebrow: "Næste handling",
            title: "Dit nyeste spørgeskema er klar til at blive færdiggjort",
            description: "Tilføj eventuelle klubspørgsmål og send derefter spørgeskemaet til medlemmerne.",
            primaryLabel: "Åbn seneste spørgeskema",
            primaryHref: "/club/surveys/latest",
            secondaryLabel: "Se dashboard",
            secondaryHref: "/club/dashboard",
          }
        : pendingSendCount > 0
          ? {
              eyebrow: "Næste handling",
              title: "Der er en planlagt udsendelse på vej",
              description: "Hold øje med arrangementer og udsendelser, så du ved hvornår medlemmerne modtager næste spørgeskema.",
              primaryLabel: "Se arrangementer",
              primaryHref: "/club/events",
              secondaryLabel: "Se udsendelser",
              secondaryHref: "/club/outbox",
            }
          : {
              eyebrow: "Næste handling",
              title: "Følg udviklingen i klubbens dashboard",
              description: "Når svarene kommer ind, kan du bruge dashboardet til at se benchmark, svarfordeling og sammenligninger.",
              primaryLabel: "Åbn dashboard",
              primaryHref: "/club/dashboard",
              secondaryLabel: "Se udsendelser",
              secondaryHref: "/club/outbox",
            };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-background p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Overblik</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Her er det korte overblik. Brug menuen Dashboard til statistik, benchmark og grafer.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/club/dashboard" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
              Åbn dashboard
            </Link>
            <Link href="/club/surveys" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
              Se spørgeskemaer
            </Link>
          </div>
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
          <p className="text-sm text-muted-foreground">Besvarelser</p>
          <p className="mt-1 text-2xl font-semibold">{responses}</p>
        </article>
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Svar-dækning</p>
          <p className="mt-1 text-2xl font-semibold">{responseCoverage.toFixed(0)}%</p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${responseCoverage}%` }} />
          </div>
        </article>
      </section>

      <NextActionPanel {...nextAction} />

      <section className="rounded-xl border bg-background p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Seneste spørgeskema</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Hurtig status på klubbens nyeste udsendelse.
            </p>
          </div>
          {latestSurvey ? (
            <Link href={`/club/surveys/${latestSurvey.id}`} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
              Åbn spørgeskema
            </Link>
          ) : null}
        </div>

        {latestSurvey ? (
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <article className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Navn</p>
              <p className="mt-1 font-semibold">{latestSurvey.name}</p>
            </article>
            <article className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="mt-1 font-semibold">{latestSurvey.status}</p>
            </article>
            <article className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Invitationer</p>
              <p className="mt-1 font-semibold">{latestSurvey._count.invitations}</p>
            </article>
            <article className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Besvarelser</p>
              <p className="mt-1 font-semibold">{latestSurvey._count.responses}</p>
            </article>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Der er ikke oprettet nogen spørgeskemaer endnu.</p>
        )}
      </section>

      <GettingStartedWizard
        title="Kom i gang"
        subtitle="Brug overblik til drift og dashboard til analyser og sammenligninger."
        steps={[
          {
            id: 1,
            title: "Opret spørgeskema fra skabelon",
            description: "Vælg en DMU-skabelon og opret et nyt spørgeskema til klubben.",
            primaryCtaLabel: "Start trin 1",
            primaryHref: "/club/surveys",
            settingsHref: "/club/surveys",
          },
          {
            id: 2,
            title: "Tilføj klubspørgsmål og udsend",
            description: "Supplér med lokale spørgsmål og send til medlemmerne.",
            primaryCtaLabel: "Start trin 2",
            primaryHref: "/club/surveys/latest",
            settingsHref: "/club/surveys/latest",
          },
          {
            id: 3,
            title: "Følg svarene i dashboardet",
            description: "Se benchmark, grafer og svarfordeling i det dedikerede dashboard.",
            primaryCtaLabel: "Åbn dashboard",
            primaryHref: "/club/dashboard",
            settingsHref: "/club/dashboard",
          },
        ]}
      />
    </div>
  );
}