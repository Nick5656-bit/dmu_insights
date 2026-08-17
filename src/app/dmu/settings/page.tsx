import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DmuSettingsPage() {
  await requireRole("DMU_ADMIN");
  const [clubUsers, sentSurveys] = await Promise.all([
    prisma.user.count({ where: { role: "CLUB_ADMIN" } }),
    prisma.surveyInstance.count({ where: { status: { in: ["SENT", "CLOSED"] } } }),
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)] [&_p.text-muted-foreground]:text-white/75">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">Administration</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Indstillinger</h1>
        <p className="mt-2 text-sm text-muted-foreground">Administrér klubadgange og se historikken for udsendelser.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Link href="/dmu/settings/club-users" className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:bg-muted/20">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Klubbrugere</p>
          <h2 className="mt-3 text-2xl font-semibold">Adgang for klubber</h2>
          <p className="mt-2 text-sm text-muted-foreground">Opret, redigér og fjern klubadministratorer.</p>
          <p className="mt-6 text-sm font-semibold text-primary">{clubUsers} klubbrugere →</p>
        </Link>
        <Link href="/dmu/settings/sends" className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:bg-muted/20">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Tidligere udsendelser</p>
          <h2 className="mt-3 text-2xl font-semibold">Historik og mails</h2>
          <p className="mt-2 text-sm text-muted-foreground">Følg planlagte og afsluttede udsendelser, samt deres mailhistorik.</p>
          <p className="mt-6 text-sm font-semibold text-primary">{sentSurveys} sendte spørgeskemaer →</p>
        </Link>
        <Link href="/dmu/settings/privacy" className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:bg-muted/20">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Databeskyttelse</p>
          <h2 className="mt-3 text-2xl font-semibold">Privatliv og sletning</h2>
          <p className="mt-2 text-sm text-muted-foreground">Se frister, den offentlige privatlivstekst og næste automatiske oprydning.</p>
          <p className="mt-6 text-sm font-semibold text-primary">Åbn datalivscyklus →</p>
        </Link>
      </section>
    </div>
  );
}
