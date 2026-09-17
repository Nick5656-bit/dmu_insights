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
  return <div className="space-y-6">
    <section className="rounded-[28px] border bg-card p-6"><h1 className="text-3xl font-semibold">Pilotopsætning</h1><p className="mt-2 text-sm text-muted-foreground">Administrér klubber og personlige adgange.</p>
      {admins.some((admin) => admin.email === "admin@dmu.dk") && <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Demo-administratoren findes stadig. Luk demo-adgangen, før platformen bruges med rigtige deltageroplysninger.</p>}
    </section>
    <section className="rounded-[28px] border bg-card p-6"><h2 className="text-xl font-semibold">Opret klub og klubadministrator</h2><p className="mt-2 text-sm text-muted-foreground">Testklubber holdes adskilt fra pilotresultater. Klubbens datatype kan ikke ændres efter oprettelse.</p><PilotSetupForm club action={createPilotClub} /></section>
    <section className="rounded-[28px] border bg-card p-6"><h2 className="text-xl font-semibold">Personlig DMU-administrator</h2><p className="mt-2 text-sm text-muted-foreground">Giv en administrator personlig adgang til alle klubber.</p><PilotSetupForm action={createPersonalDmuAdmin} /><ul className="mt-4 space-y-1 text-sm">{admins.map((admin) => <li key={admin.id}>{admin.name} – {admin.email}{admin.email === "admin@dmu.dk" ? " (demo)" : ""}</li>)}</ul></section>
    <section className="rounded-[28px] border bg-card p-6"><h2 className="text-xl font-semibold">Klubber</h2><ul className="mt-4 divide-y">{clubs.map((club) => <li key={club.id} className="py-3 text-sm"><strong>{club.name}</strong> · {club.city} · <span className="font-semibold">{club.isTest ? "TEST" : "PILOT"}</span> · {club._count.users} brugere · {club._count.surveyInstances} spørgeskemaer</li>)}</ul><Link className="mt-3 inline-block underline" href="/dmu/settings/club-users">Administrér eksisterende klubbrugere</Link></section>
  </div>;
}
