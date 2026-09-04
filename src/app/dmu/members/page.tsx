import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AgeGroup, MemberRole, RaceClass } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SubmitButton } from "@/components/submit-button";

// ── Hjælpefunktioner ────────────────────────────────────────────────────────

const ageGroupLabels: Record<AgeGroup, string> = {
  UNDER_18: "Under 18",
  AGE_18_30: "18–30 år",
  AGE_31_50: "31–50 år",
  AGE_51_PLUS: "51+ år",
};

const raceClassLabels: Record<RaceClass, string> = {
  MOTOCROSS: "Motocross",
  ENDURO: "Enduro",
  SPEEDWAY: "Speedway",
  TRIAL: "Trial",
};

const memberRoleLabels: Record<MemberRole, string> = {
  RIDER: "Kører",
  VOLUNTEER: "Frivillig",
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function DmuMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string; success?: string; error?: string; imported?: string; skipped?: string }>;
}) {
  await requireRole("DMU_ADMIN");
  const { clubId, success, error, imported, skipped } = await searchParams;

  const clubs = await prisma.club.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: { _count: { select: { members: { where: { active: true } } } } },
  });

  const selectedClub = clubId ? clubs.find((c) => c.id === clubId) : null;

  const members = selectedClub
    ? await prisma.member.findMany({
        where: { clubId: selectedClub.id, active: true },
        orderBy: [{ name: "asc" }],
      })
    : [];

  const totalMembers = clubs.reduce((sum, c) => sum + c._count.members, 0);

  // ── Server actions ─────────────────────────────────────────────────────────

  async function importFromExcelAction(formData: FormData) {
    "use server";
    await requireRole("DMU_ADMIN");

    const targetClubId = formData.get("clubId") as string;
    const rawText = formData.get("pasteData") as string;
    const defaultAgeGroup = (formData.get("defaultAgeGroup") as AgeGroup) ?? "AGE_18_30";
    const defaultRaceClass = (formData.get("defaultRaceClass") as RaceClass) ?? "MOTOCROSS";
    const defaultMemberRole = (formData.get("defaultMemberRole") as MemberRole) ?? "RIDER";

    if (!targetClubId || !rawText?.trim()) {
      redirect(`/dmu/members?clubId=${targetClubId}&error=missing_data`);
    }

    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    let importedCount = 0;
    let skippedCount = 0;

    for (const line of lines) {
      // Excel bruger tab som separator – vi understøtter også semikolon og komma
      const cols = line.split(/\t|;|,/).map((c) => c.trim());
      const name = cols[0]?.trim();
      const email = cols[1]?.trim().toLowerCase();

      if (!name || !email || !isValidEmail(email)) {
        skippedCount++;
        continue;
      }

      try {
        // Opret kun hvis e-mail ikke allerede findes
        const existing = await prisma.member.findUnique({ where: { email } });
        if (existing) {
          skippedCount++;
          continue;
        }

        await prisma.member.create({
          data: {
            clubId: targetClubId,
            name,
            email,
            ageGroup: defaultAgeGroup,
            raceClass: defaultRaceClass,
            memberRole: defaultMemberRole,
          },
        });
        importedCount++;
      } catch {
        skippedCount++;
      }
    }

    revalidatePath("/dmu/members");
    redirect(
      `/dmu/members?clubId=${targetClubId}&success=imported&imported=${importedCount}&skipped=${skippedCount}`
    );
  }

  async function addSingleMemberAction(formData: FormData) {
    "use server";
    await requireRole("DMU_ADMIN");

    const targetClubId = formData.get("clubId") as string;
    const name = (formData.get("name") as string)?.trim();
    const email = (formData.get("email") as string)?.trim().toLowerCase();
    const ageGroup = formData.get("ageGroup") as AgeGroup;
    const raceClass = formData.get("raceClass") as RaceClass;
    const memberRole = formData.get("memberRole") as MemberRole;

    if (!targetClubId || !name || !email || !isValidEmail(email)) {
      redirect(`/dmu/members?clubId=${targetClubId}&error=invalid_input`);
    }

    const existing = await prisma.member.findUnique({ where: { email } });
    if (existing) {
      redirect(`/dmu/members?clubId=${targetClubId}&error=email_taken`);
    }

    await prisma.member.create({
      data: { clubId: targetClubId, name, email, ageGroup, raceClass, memberRole },
    });

    revalidatePath("/dmu/members");
    redirect(`/dmu/members?clubId=${targetClubId}&success=added`);
  }

  async function deleteMemberAction(formData: FormData) {
    "use server";
    await requireRole("DMU_ADMIN");

    const memberId = formData.get("memberId") as string;
    const targetClubId = formData.get("clubId") as string;

    if (!memberId) return;

    await prisma.member.update({
      where: { id: memberId },
      data: { active: false },
    });

    revalidatePath("/dmu/members");
    redirect(`/dmu/members?clubId=${targetClubId}&success=deleted`);
  }

  // ── Feedback messages ──────────────────────────────────────────────────────

  const errorMessages: Record<string, string> = {
    missing_data: "Vælg en klub og indsæt data.",
    invalid_input: "Udfyld navn og en gyldig e-mail.",
    email_taken: "E-mailadressen er allerede registreret.",
  };

  const successMessage =
    success === "imported"
      ? `✓ ${imported ?? 0} medlemmer importeret. ${skipped ?? 0} sprunget over (ugyldige eller dubletter).`
      : success === "added"
        ? "✓ Medlem tilføjet."
        : success === "deleted"
          ? "✓ Medlem fjernet."
          : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)] [&_p.text-muted-foreground]:text-white/75 [&_article]:rounded-[22px] [&_article]:border-white/12 [&_article]:bg-white/10">
        <h2 className="text-xl font-semibold">Medlemsstyring</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Importér og administrér klubmedlemmer. Medlemmerne modtager spørgeskema-invitationer via e-mail.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <article className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Aktive klubber</p>
            <p className="mt-1 text-2xl font-semibold">{clubs.length}</p>
          </article>
          <article className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Medlemmer i alt</p>
            <p className="mt-1 text-2xl font-semibold">{totalMembers}</p>
          </article>
          <article className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Valgt klub</p>
            <p className="mt-1 text-2xl font-semibold">{selectedClub?.name ?? "—"}</p>
          </article>
        </div>
      </section>

      {/* Feedback */}
      {successMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {successMessage}
        </div>
      )}
      {error && errorMessages[error] && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessages[error]}
        </div>
      )}

      {/* Klub-vælger */}
      <section className="rounded-xl border bg-background p-6">
        <h3 className="mb-3 text-base font-semibold">Vælg klub</h3>
        <form method="get" className="flex flex-wrap gap-3">
          <select
            name="clubId"
            defaultValue={clubId ?? ""}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">Vælg klub…</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.city} ({c._count.members} medlemmer)
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-10 rounded-md bg-foreground px-5 text-sm font-medium text-background hover:bg-foreground/80"
          >
            Vis klub
          </button>
        </form>
      </section>

      {selectedClub && (
        <>
          {/* Import fra Excel */}
          <section className="rounded-xl border bg-background p-6">
            <h3 className="text-base font-semibold">Importér fra Excel</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Kopier to kolonner fra dit Excel-ark (Navn og E-mail) og indsæt nedenfor. Sørg for at kolonnerne er i rækkefølgen{" "}
              <strong>Navn → E-mail</strong>.
            </p>

            <div className="mt-4 rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground font-mono">
              Eksempel på format (fra Excel):
              <br />
              Lars Nielsen{"    "}lars@email.dk
              <br />
              Mette Jensen{"    "}mette@email.dk
            </div>

            <form action={importFromExcelAction} className="mt-5 space-y-4">
              <input type="hidden" name="clubId" value={selectedClub.id} />

              <textarea
                name="pasteData"
                rows={8}
                required
                placeholder={"Indsæt her…\nLars Nielsen\tlars@email.dk\nMette Jensen\tmette@email.dk"}
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Standard aldersgruppe</label>
                  <select
                    name="defaultAgeGroup"
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    defaultValue="AGE_18_30"
                  >
                    {(Object.entries(ageGroupLabels) as [AgeGroup, string][]).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Standard køreklasse</label>
                  <select
                    name="defaultRaceClass"
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    defaultValue="MOTOCROSS"
                  >
                    {(Object.entries(raceClassLabels) as [RaceClass, string][]).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Standard rolle</label>
                  <select
                    name="defaultMemberRole"
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    defaultValue="RIDER"
                  >
                    {(Object.entries(memberRoleLabels) as [MemberRole, string][]).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Aldersgruppe, køreklasse og rolle bruges til filtrering i analyser. Du kan altid redigere dem bagefter.
                Eksisterende e-mailadresser springes automatisk over.
              </p>

              <SubmitButton pendingText="Importerer..." className="rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background hover:bg-foreground/80">
                Importér medlemmer
              </SubmitButton>
            </form>
          </section>

          {/* Tilføj enkeltperson */}
          <section className="rounded-xl border bg-background p-6">
            <h3 className="mb-4 text-base font-semibold">Tilføj enkelt medlem</h3>
            <form action={addSingleMemberAction} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="clubId" value={selectedClub.id} />

              <div className="space-y-1">
                <label className="text-sm font-medium">Navn</label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="Lars Nielsen"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">E-mail</label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="lars@email.dk"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Aldersgruppe</label>
                <select
                  name="ageGroup"
                  defaultValue="AGE_18_30"
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  {(Object.entries(ageGroupLabels) as [AgeGroup, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Køreklasse</label>
                <select
                  name="raceClass"
                  defaultValue="MOTOCROSS"
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  {(Object.entries(raceClassLabels) as [RaceClass, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Rolle</label>
                <select
                  name="memberRole"
                  defaultValue="RIDER"
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  {(Object.entries(memberRoleLabels) as [MemberRole, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-end sm:col-span-2">
                <SubmitButton pendingText="Tilføjer..." className="rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background hover:bg-foreground/80">
                  Tilføj medlem
                </SubmitButton>
              </div>
            </form>
          </section>

          {/* Medlemsliste */}
          <section className="rounded-xl border bg-background p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">
                Medlemmer i {selectedClub.name}
              </h3>
              <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                {members.length} aktive
              </span>
            </div>

            {members.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Ingen aktive medlemmer endnu. Importér fra Excel ovenfor.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Navn</th>
                      <th className="px-4 py-2 font-medium">E-mail</th>
                      <th className="px-4 py-2 font-medium">Alder</th>
                      <th className="px-4 py-2 font-medium">Klasse</th>
                      <th className="px-4 py-2 font-medium">Rolle</th>
                      <th className="px-4 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {members.map((member) => (
                      <tr key={member.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">{member.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{member.email}</td>
                        <td className="px-4 py-3 text-muted-foreground">{ageGroupLabels[member.ageGroup]}</td>
                        <td className="px-4 py-3 text-muted-foreground">{raceClassLabels[member.raceClass]}</td>
                        <td className="px-4 py-3 text-muted-foreground">{memberRoleLabels[member.memberRole]}</td>
                        <td className="px-4 py-3 text-right">
                          <form action={deleteMemberAction}>
                            <input type="hidden" name="memberId" value={member.id} />
                            <input type="hidden" name="clubId" value={selectedClub.id} />
                            <SubmitButton
                              pendingText="Fjerner..."
                              className="rounded-md border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                              onClick={(e) => {
                                if (!confirm(`Fjern ${member.name}?`)) e.preventDefault();
                              }}
                            >
                              Fjern
                            </SubmitButton>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
