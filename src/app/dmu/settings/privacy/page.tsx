import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { PII_RETENTION_DAYS, RESPONSE_RETENTION_YEARS } from "@/lib/data-retention";
import { prisma } from "@/lib/prisma";

function subtractDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

function subtractYears(date: Date, years: number) {
  const result = new Date(date);
  result.setUTCFullYear(result.getUTCFullYear() - years);
  return result;
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function DmuPrivacySettingsPage() {
  await requireRole("DMU_ADMIN");
  const now = new Date();
  const [redactionDue, responseDeletionDue, lastJobRun] = await Promise.all([
    prisma.surveyInstance.count({
      where: { status: "CLOSED", closesAt: { not: null, lte: subtractDays(now, PII_RETENTION_DAYS) } },
    }),
    prisma.surveyInstance.count({
      where: { status: "CLOSED", closesAt: { not: null, lte: subtractYears(now, RESPONSE_RETENTION_YEARS) } },
    }),
    prisma.systemJobRun.findFirst({
      where: { jobName: "daily-maintenance" },
      orderBy: { startedAt: "desc" },
      select: { status: true, startedAt: true, finishedAt: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-primary/20 bg-[linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-white shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70">Databeskyttelse</p>
        <h1 className="mt-2 text-3xl font-semibold">Privatliv og datalivscyklus</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/75">Den daglige systemopgave lukker surveys, fjerner kontaktoplysninger efter {PII_RETENTION_DAYS} dage og sletter anonymiserede svar efter {RESPONSE_RETENTION_YEARS} år.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[24px] border bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Klar til oprydning</p>
          <p className="mt-3 text-3xl font-semibold">{redactionDue}</p>
          <p className="mt-2 text-sm text-muted-foreground">Lukkede surveys, hvor kontaktdata slettes ved næste daglige kørsel.</p>
        </article>
        <article className="rounded-[24px] border bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Klar til sletning</p>
          <p className="mt-3 text-3xl font-semibold">{responseDeletionDue}</p>
          <p className="mt-2 text-sm text-muted-foreground">Lukkede surveys, hvor svar slettes ved næste daglige kørsel.</p>
        </article>
        <article className="rounded-[24px] border bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Seneste systemkørsel</p>
          <p className="mt-3 text-xl font-semibold">
            {lastJobRun ? (lastJobRun.status === "SUCCEEDED" ? "Gennemført" : lastJobRun.status === "FAILED" ? "Fejlet" : "I gang") : "Ikke kørt endnu"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {lastJobRun ? formatDateTime(lastJobRun.finishedAt ?? lastJobRun.startedAt) : "Status vises efter næste planlagte kørsel."}
          </p>
        </article>
      </section>

      <section className="rounded-[24px] border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Før offentlig drift</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Angiv <code>PRIVACY_CONTACT_EMAIL</code> i Vercel, så deltagerne får en konkret kontaktadresse.</li>
          <li>Få privatlivsteksten, behandlingsgrundlaget og databehandleraftalerne godkendt af DMU’s ansvarlige for databeskyttelse.</li>
          <li>Gennemgå leverandørernes backupperioder og dokumentér dem i DMU’s behandlingsfortegnelse.</li>
        </ul>
        <Link href="/privacy" className="mt-5 inline-flex rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Se offentlig privatlivstekst</Link>
      </section>
    </div>
  );
}
