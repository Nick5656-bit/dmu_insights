import Link from "next/link";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ClubDeliveryTabs } from "@/components/club-delivery-tabs";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const mailStatusLabel: Record<string, string> = {
  SENT: "Sendt",
  FAILED: "Fejlet",
};

const mailStatusColor: Record<string, string> = {
  SENT: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
};

const invitationStatusLabel: Record<string, string> = {
  SENT: "Afsendt",
  OPENED: "Åbnet",
  ANSWERED: "Besvaret",
  EXPIRED: "Udløbet",
};

const invitationStatusColor: Record<string, string> = {
  SENT: "bg-blue-100 text-blue-800",
  OPENED: "bg-yellow-100 text-yellow-800",
  ANSWERED: "bg-green-100 text-green-800",
  EXPIRED: "bg-gray-100 text-gray-600",
};

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));
}

function formatDateShort(d: Date) {
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(d));
}

const addExtraEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().max(80).optional(),
});

export default async function ClubMailLogPage({
  searchParams,
}: {
  searchParams: Promise<{ surveyInstanceId?: string; mailStatus?: string; responseState?: string; show?: string }>;
}) {
  const session = await requireRole("CLUB_ADMIN");
  const { surveyInstanceId, mailStatus, responseState, show } = await searchParams;
  const shouldShowDetails = show === "1";
  const mailStatusFilter = mailStatus === "SENT" || mailStatus === "FAILED" ? mailStatus : undefined;
  const responseStateFilter = responseState === "ANSWERED" || responseState === "NOT_ANSWERED" ? responseState : undefined;

  if (!session.clubId) {
    return (
      <div className="rounded-xl border bg-background p-6 text-sm text-muted-foreground">
        Din konto er ikke tilknyttet en klub. Kontakt DMU for hjælp.
      </div>
    );
  }

  const clubId = session.clubId;

  async function addExtraEmailAction(formData: FormData) {
    "use server";
    const currentSession = await requireRole("CLUB_ADMIN");
    if (!currentSession.clubId) {
      return;
    }

    const parsed = addExtraEmailSchema.safeParse({
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
    });

    if (!parsed.success) {
      return;
    }

    await prisma.clubExtraEmail.upsert({
      where: {
        clubId_email: {
          clubId: currentSession.clubId,
          email: parsed.data.email,
        },
      },
      update: {
        name: parsed.data.name || null,
        active: true,
      },
      create: {
        clubId: currentSession.clubId,
        email: parsed.data.email,
        name: parsed.data.name || null,
      },
    });

    revalidatePath("/club/mail-log");
  }

  async function removeExtraEmailAction(formData: FormData) {
    "use server";
    const currentSession = await requireRole("CLUB_ADMIN");
    if (!currentSession.clubId) {
      return;
    }

    const extraEmailId = String(formData.get("extraEmailId") ?? "");
    if (!extraEmailId) {
      return;
    }

    await prisma.clubExtraEmail.updateMany({
      where: {
        id: extraEmailId,
        clubId: currentSession.clubId,
      },
      data: { active: false },
    });

    revalidatePath("/club/mail-log");
  }

  const [club, memberRecipients, extraRecipients, surveyOptions, sentCount, failedCount, answeredCount, latestMailLog] = await Promise.all([
    prisma.club.findUnique({ where: { id: clubId } }),
    prisma.member.findMany({
      where: {
        clubId,
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.clubExtraEmail.findMany({
      where: {
        clubId,
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.surveyInstance.findMany({
      where: { clubId },
      select: {
        id: true,
        name: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.mailLog.count({
      where: {
        surveyInvitation: {
          surveyInstance: { clubId },
        },
      },
    }),
    prisma.mailLog.count({
      where: {
        status: "FAILED",
        surveyInvitation: {
          surveyInstance: { clubId },
        },
      },
    }),
    prisma.mailLog.count({
      where: {
        surveyInvitation: {
          status: "ANSWERED",
          surveyInstance: { clubId },
        },
      },
    }),
    prisma.mailLog.findFirst({
      where: {
        surveyInvitation: {
          surveyInstance: { clubId },
        },
      },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    }),
  ]);

  const selectedSurvey = surveyInstanceId
    ? surveyOptions.find((survey) => survey.id === surveyInstanceId)
    : null;
  const hasActiveFilters = Boolean(surveyInstanceId || mailStatusFilter || responseStateFilter);

  const detailedLogs = shouldShowDetails
    ? await prisma.mailLog.findMany({
        where: {
          ...(mailStatusFilter ? { status: mailStatusFilter } : {}),
          surveyInvitation: {
            ...(responseStateFilter === "ANSWERED"
              ? { status: "ANSWERED" }
              : responseStateFilter === "NOT_ANSWERED"
                ? { status: { in: ["CREATED", "SENT", "OPENED"] } }
                : {}),
            ...(surveyInstanceId ? { surveyInstanceId } : {}),
            surveyInstance: { clubId },
          },
        },
        include: {
          surveyInvitation: {
            include: {
              surveyInstance: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { sentAt: "desc" },
        take: 100,
      })
    : [];

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)] [&_p.text-muted-foreground]:text-white/75 [&_article]:rounded-[22px] [&_article]:border-white/12 [&_article]:bg-white/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="text-white/75 [&_h2]:text-white [&_p]:text-white/75 [&_span.text-foreground]:text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Udsendelser</p>
            <h2 className="mt-2 text-2xl font-bold">Mailhistorik</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Mails til <span className="font-medium text-foreground">{club?.name}</span>.
            </p>
          </div>
          <ClubDeliveryTabs variant="dark" />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <article className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Mails afsendt</p>
            <p className="mt-1 text-2xl font-semibold">{sentCount}</p>
          </article>
          <article className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Besvarelser</p>
            <p className="mt-1 text-2xl font-semibold text-green-700">{answeredCount}</p>
          </article>
          <article className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Fejlede udsendelser</p>
            <p className="mt-1 text-2xl font-semibold text-red-600">{failedCount}</p>
          </article>
          <article className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Seneste mail</p>
            <p className="mt-1 text-2xl font-semibold">
              {latestMailLog ? formatDateShort(latestMailLog.sentAt) : "–"}
            </p>
          </article>
        </div>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">Modtagere</h3>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <article className="rounded-lg border p-4">
            <p className="text-sm font-medium">DMU-synkroniserede medlemsmails</p>
            <p className="mt-1 text-xs text-muted-foreground">Fra DMU.</p>
            <div className="mt-3 max-h-64 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Navn</th>
                    <th className="px-3 py-2 font-medium">Mail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {memberRecipients.map((recipient) => (
                    <tr key={recipient.id}>
                      <td className="px-3 py-2">{recipient.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{recipient.email}</td>
                    </tr>
                  ))}
                  {memberRecipients.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-3 py-3 text-sm text-muted-foreground">
                        Ingen aktive medlemmer fundet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-lg border p-4">
            <p className="text-sm font-medium">Ekstra lokale mails</p>
            <p className="mt-1 text-xs text-muted-foreground">Lokale ekstra mails.</p>

            <form action={addExtraEmailAction} className="mt-3 grid gap-2 md:grid-cols-5">
              <input
                name="name"
                placeholder="Navn (valgfri)"
                className="md:col-span-2"
                maxLength={80}
              />
              <input
                type="email"
                name="email"
                placeholder="mail@eksempel.dk"
                className="md:col-span-2"
                required
              />
              <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
                Tilføj
              </button>
            </form>

            <div className="mt-3 max-h-52 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Navn</th>
                    <th className="px-3 py-2 font-medium">Mail</th>
                    <th className="px-3 py-2 font-medium">Handling</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {extraRecipients.map((recipient) => (
                    <tr key={recipient.id}>
                      <td className="px-3 py-2">{recipient.name || "-"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{recipient.email}</td>
                      <td className="px-3 py-2">
                        <form action={removeExtraEmailAction}>
                          <input type="hidden" name="extraEmailId" value={recipient.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                          >
                            Fjern
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                  {extraRecipients.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-3 text-sm text-muted-foreground">
                        Ingen ekstra mails tilføjet endnu.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-base font-semibold">Filtre</h3>

        <form method="get" className="mt-4 grid gap-3 md:grid-cols-4">
          <input type="hidden" name="show" value="1" />

          <select
            name="surveyInstanceId"
            defaultValue={surveyInstanceId ?? ""}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Alle spørgeskemaer</option>
            {surveyOptions.map((survey) => (
              <option key={survey.id} value={survey.id}>
                {survey.name}
              </option>
            ))}
          </select>

          <select
            name="mailStatus"
            defaultValue={mailStatusFilter ?? ""}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Alle mail-statusser</option>
            <option value="SENT">Sendt</option>
            <option value="FAILED">Fejlet</option>
          </select>

          <select
            name="responseState"
            defaultValue={responseStateFilter ?? ""}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Alle svar-statusser</option>
            <option value="ANSWERED">Besvaret</option>
            <option value="NOT_ANSWERED">Ikke besvaret</option>
          </select>

          <div className="flex gap-3">
            <button
              type="submit"
              className="h-10 flex-1 rounded-md bg-foreground px-4 text-sm font-medium text-background hover:bg-foreground/80"
            >
              Vis mails
            </button>
            {(shouldShowDetails || hasActiveFilters) && (
              <Link
                href="/club/mail-log"
                className="flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm text-muted-foreground hover:bg-muted"
              >
                Nulstil
              </Link>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="mb-1 text-base font-semibold">
          {selectedSurvey ? `Mails for ${selectedSurvey.name}` : "Afsendelseshistorik"}
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">{selectedSurvey ? "Seneste 100 mails for valgt spørgeskema." : "Seneste 100 mails for klubben."}</p>

        {!shouldShowDetails ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Vælg filtre og hent listen.
          </div>
        ) : detailedLogs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Ingen mails fundet med de valgte filtre.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Modtager</th>
                  <th className="pb-3 pr-4 font-medium">Spørgeskema</th>
                  <th className="pb-3 pr-4 font-medium">Emne</th>
                  <th className="pb-3 pr-4 font-medium">Sendt</th>
                  <th className="pb-3 pr-4 font-medium">Mail-status</th>
                  <th className="pb-3 font-medium">Svar-status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {detailedLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30">
                    <td className="py-3 pr-4 text-muted-foreground">{log.toEmail}</td>
                    <td className="py-3 pr-4 max-w-[180px] truncate text-muted-foreground" title={log.surveyInvitation.surveyInstance.name}>
                      {log.surveyInvitation.surveyInstance.name}
                    </td>
                    <td className="py-3 pr-4 max-w-[220px] truncate" title={log.subject}>
                      {log.subject}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                      {formatDate(log.sentAt)}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          mailStatusColor[log.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {mailStatusLabel[log.status] ?? log.status}
                      </span>
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          invitationStatusColor[log.surveyInvitation.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {invitationStatusLabel[log.surveyInvitation.status] ?? log.surveyInvitation.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
