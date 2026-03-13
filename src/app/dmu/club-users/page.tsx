import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DeleteClubUserButton } from "@/components/delete-club-user-button";

export default async function DmuClubUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await requireRole("DMU_ADMIN");
  const { success, error } = await searchParams;

  // All active clubs + their current CLUB_ADMIN users
  const clubs = await prisma.club.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: {
      users: {
        where: { role: "CLUB_ADMIN" },
        orderBy: { name: "asc" },
      },
    },
  });

  // ── Server actions ──────────────────────────────────────────────

  async function createClubUser(formData: FormData) {
    "use server";
    await requireRole("DMU_ADMIN");

    const clubId = formData.get("clubId") as string;
    const name = (formData.get("name") as string)?.trim();
    const email = (formData.get("email") as string)?.trim().toLowerCase();
    const password = formData.get("password") as string;

    if (!clubId || !name || !email || !password || password.length < 6) {
      redirect("/dmu/club-users?error=invalid_input");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      redirect("/dmu/club-users?error=email_taken");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: { name, email, passwordHash, role: "CLUB_ADMIN", clubId },
    });

    revalidatePath("/dmu/club-users");
    redirect("/dmu/club-users?success=created");
  }

  async function deleteClubUser(formData: FormData) {
    "use server";
    await requireRole("DMU_ADMIN");

    const userId = formData.get("userId") as string;
    if (!userId) return;

    await prisma.user.delete({ where: { id: userId } });

    revalidatePath("/dmu/club-users");
    redirect("/dmu/club-users?success=deleted");
  }

  // ── Render ───────────────────────────────────────────────────────

  const errorMessages: Record<string, string> = {
    invalid_input: "Udfyld alle felter. Adgangskoden skal være mindst 6 tegn.",
    email_taken: "E-mailadressen er allerede registreret i systemet.",
  };

  const successMessages: Record<string, string> = {
    created: "Brugeren er oprettet og kan nu logge ind.",
    deleted: "Brugeren er slettet.",
  };

  const totalUsers = clubs.reduce((sum, c) => sum + c.users.length, 0);
  const clubsWithUsers = clubs.filter((c) => c.users.length > 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">Klubbrugere</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Administrer login-adgang for klubformænd og -admins. Én klub kan have flere aktive brugere.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <article className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Aktive klubber</p>
            <p className="mt-1 text-2xl font-semibold">{clubs.length}</p>
          </article>
          <article className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Klubber med adgang</p>
            <p className="mt-1 text-2xl font-semibold">{clubsWithUsers}</p>
          </article>
          <article className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Aktive brugere i alt</p>
            <p className="mt-1 text-2xl font-semibold">{totalUsers}</p>
          </article>
        </div>
      </section>

      {/* Feedback banners */}
      {success && successMessages[success] && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          ✓ {successMessages[success]}
        </div>
      )}
      {error && errorMessages[error] && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessages[error]}
        </div>
      )}

      {/* Create user form */}
      <section className="rounded-xl border bg-background p-6">
        <h3 className="mb-1 text-base font-semibold">Opret ny klubbruger</h3>
        <p className="mb-5 text-sm text-muted-foreground">
          Vælg en klub, udfyld formandens navn og e-mail, og angiv en midlertidig adgangskode som du deler med vedkommende.
        </p>
        <form action={createClubUser} className="grid gap-4 sm:grid-cols-2">
          {/* Club selector */}
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="clubId" className="text-sm font-medium">
              Klub
            </label>
            <select
              id="clubId"
              name="clubId"
              required
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Vælg en klub…</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.city}
                  {c.users.length > 0 ? ` (${c.users.length} bruger${c.users.length > 1 ? "e" : ""})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div className="space-y-1">
            <label htmlFor="name" className="text-sm font-medium">
              Navn
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="f.eks. Lars Nielsen"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Email */}
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="formand@klub.dk"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Password */}
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="password" className="text-sm font-medium">
              Midlertidig adgangskode
            </label>
            <input
              id="password"
              name="password"
              type="text"
              required
              minLength={6}
              placeholder="Minimum 6 tegn — del denne med formanden"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Adgangskoden vises i klartekst her så du kan notere og dele den. Den gemmes krypteret i databasen.
            </p>
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background hover:bg-foreground/80"
            >
              Opret bruger
            </button>
          </div>
        </form>
      </section>

      {/* Existing users grouped by club */}
      <section className="rounded-xl border bg-background p-6">
        <h3 className="mb-4 text-base font-semibold">Eksisterende klubbrugere</h3>

        {totalUsers === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Ingen klubbrugere endnu. Opret den første ovenfor.
          </div>
        ) : (
          <div className="space-y-6">
            {clubs
              .filter((c) => c.users.length > 0)
              .map((club) => (
                <div key={club.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="font-medium">{club.name}</span>
                    <span className="text-xs text-muted-foreground">— {club.city}</span>
                    <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {club.users.length} bruger{club.users.length > 1 ? "e" : ""}
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-4 py-2 font-medium">Navn</th>
                          <th className="px-4 py-2 font-medium">E-mail</th>
                          <th className="px-4 py-2 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {club.users.map((user) => (
                          <tr key={user.id} className="hover:bg-muted/20">
                            <td className="px-4 py-3 font-medium">{user.name}</td>
                            <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                            <td className="px-4 py-3 text-right">
                              <DeleteClubUserButton
                                action={deleteClubUser}
                                userId={user.id}
                                userName={user.name}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
