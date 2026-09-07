import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PilotSetupForm } from "@/components/pilot-setup-form";
import { createPersonalDmuAdmin, createPilotClub } from "./actions";

export default async function PilotSetupPage() {
  await requireRole("DMU_ADMIN");
  const [clubs, admins] = await Promise.all([
    prisma.club.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, city: true, isTest: true, _count: { select: { users: true, surveyInstances: true } } } }),
    prisma.user.findMany({ where: { role: "DMU_ADMIN" }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);
  const required = ["NEXT_PUBLIC_APP_URL", "SMTP_FROM", "PRIVACY_CONTACT_EMAIL", "BREVO_API_KEY", "CRON_SECRET", "SESSION_SECRET", "SURVEY_TOKEN_ENCRYPTION_KEY"];
  const missing = required.filter((name) => !process.env[name]?.trim());
  return <div className="space-y-6">
    <section className="rounded-[28px] border bg-card p-6"><h1 className="text-3xl font-semibold">Pilotopsætning</h1><p className="mt-2 text-sm text-muted-foreground">Opret klubber og personlige adgange uden at nulstille databasen.</p>
      <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Demo-adgangen er bevaret til test. Platformen er ikke klar til rigtige deltageroplysninger, før demo-adgangen er lukket, sikkerhedsopdateringer er gennemført, og punkterne nedenfor er godkendt.</p>
    </section>
    <section className="rounded-[28px] border bg-card p-6"><h2 className="text-xl font-semibold">Opret klub og klubadministrator</h2><p className="mt-2 text-sm text-muted-foreground">Test og pilot holdes adskilt i resultater, sammenligninger og eksport. Datatypen fastsættes ved oprettelse: Opret en ny pilotklub frem for at omdanne en testklub med historik.</p><PilotSetupForm club action={createPilotClub} /></section>
    <section className="rounded-[28px] border bg-card p-6"><h2 className="text-xl font-semibold">Personlig DMU-administrator</h2><p className="mt-2 text-sm text-muted-foreground">Opret og afprøv den personlige adgang, før demo-login fjernes til sidst.</p><PilotSetupForm action={createPersonalDmuAdmin} /><ul className="mt-4 space-y-1 text-sm">{admins.map((admin) => <li key={admin.id}>{admin.name} – {admin.email}{admin.email === "admin@dmu.dk" ? " (demo)" : ""}</li>)}</ul></section>
    <section className="rounded-[28px] border bg-card p-6"><h2 className="text-xl font-semibold">Klubber</h2><ul className="mt-4 divide-y">{clubs.map((club) => <li key={club.id} className="py-3 text-sm"><strong>{club.name}</strong> · {club.city} · <span className="font-semibold">{club.isTest ? "TEST" : "PILOT"}</span> · {club._count.users} brugere · {club._count.surveyInstances} spørgeskemaer</li>)}</ul><Link className="mt-3 inline-block underline" href="/dmu/settings/club-users">Administrér eksisterende klubbrugere</Link></section>
    <section className="space-y-3 rounded-[28px] border bg-card p-6"><h2 className="text-xl font-semibold">Kontrol før rigtige deltagere</h2>
      <p className="text-sm">{missing.length ? `Manglende indstillinger: ${missing.join(", ")}` : "De nødvendige miljøvariabler er udfyldt. Dette kontrollerer kun tilstedeværelse, ikke om nøgler og værdier virker."}</p>
      <ul className="list-disc space-y-2 pl-5 text-sm">
        <li>Test personlige DMU- og klublogins samt adgangsadskillelse med to testklubber.</li>
        <li>Send til egne testadresser; besvar og kontrollér under/fra fem svar i dashboard og eksport.</li>
        <li><Link className="underline" href="/dmu/settings/manual-send">Kontrollér mailkø og seneste automatiske kørsel.</Link></li>
        <li>DMU skal godkende den endelige privatlivstekst, behandlingsgrundlag, kontakt, slettefrister og leverandøraftaler. Den offentlige tekst er stadig et udkast.</li>
        <li>Tag en backup og gennemfør en restore-test i en separat database. Opbevar ikke persondata eller backupfiler i Git.</li>
        <li>Gennemfør de udestående sikkerhedsopdateringer. Fjern demo-adgang og demokoder som sidste trin.</li>
      </ul>
      <p className="text-sm text-muted-foreground">De organisatoriske kontroller kan ikke godkendes automatisk af platformen. Ingen konti, besvarelser eller DNS-indstillinger ændres af at åbne denne side.</p>
    </section>
  </div>;
}
