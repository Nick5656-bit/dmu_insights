import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processDueScheduledSends } from "@/lib/scheduled-sends";
import { SubmitButton } from "@/components/submit-button";

const participantSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().max(120).optional(),
});

const surveyStatusLabel: Record<string, string> = {
  DRAFT: "Planlagt",
  SCHEDULED: "Planlagt",
  SENT: "Sendt",
  CLOSED: "Lukket",
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "full" }).format(value);
}

function formatDateTime(value: Date | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" }).format(value)
    : "Ikke planlagt";
}

function parseParticipants(rawText: string) {
  const rows = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const participants: Array<{ email: string; name: string | null }> = [];
  let skipped = 0;

  for (const row of rows) {
    const columns = row.split(/\t|;|,/).map((value) => value.trim()).filter(Boolean);
    const emailIndex = columns.findIndex((value) => participantSchema.shape.email.safeParse(value).success);
    if (emailIndex === -1) {
      skipped += 1;
      continue;
    }

    const parsed = participantSchema.safeParse({
      email: columns[emailIndex],
      name: emailIndex > 0 ? columns[0] : undefined,
    });
    if (!parsed.success) {
      skipped += 1;
      continue;
    }

    participants.push({
      email: parsed.data.email.toLowerCase(),
      name: parsed.data.name || null,
    });
  }

  const uniqueParticipants = [...new Map(participants.map((p) => [p.email, p])).values()];
  return { participants: uniqueParticipants, skipped: skipped + participants.length - uniqueParticipants.length };
}

async function isParticipantListLocked(eventId: string) {
  const survey = await prisma.surveyInstance.findFirst({
    where: { eventId },
    include: { scheduledSends: { orderBy: { sendAt: "asc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
  });

  return survey?.status === "SENT" || survey?.status === "CLOSED" || survey?.scheduledSends[0]?.status === "PROCESSED";
}

export default async function DmuEventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string; skipped?: string }>;
}) {
  await requireRole("DMU_ADMIN");
  const { id } = await params;
  const feedback = await searchParams;

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      club: { select: { name: true } },
      participants: { orderBy: [{ createdAt: "desc" }, { email: "asc" }] },
      surveyInstances: {
        include: {
          surveyTemplate: { select: { name: true } },
          scheduledSends: { orderBy: { sendAt: "asc" } },
          invitations: {
            select: {
              id: true,
              status: true,
              deliveryStatus: true,
              reminderStatus: true,
              sentAt: true,
              reminderSentAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!event) {
    notFound();
  }

  const survey = event.surveyInstances[0];
  const scheduledSend = survey?.scheduledSends[0];
  const isLocked = survey?.status === "SENT" || survey?.status === "CLOSED" || scheduledSend?.status === "PROCESSED";

  // ── Leveringsstatus-aggregater ────────────────────────────────────────────
  const invitations = survey?.invitations ?? [];
  const inviteStats = {
    total: invitations.length,
    sent: invitations.filter((i) => i.deliveryStatus === "SENT").length,
    pending: invitations.filter((i) => i.deliveryStatus === "PENDING" || i.deliveryStatus === "SENDING").length,
    failed: invitations.filter((i) => i.deliveryStatus === "FAILED").length,
    answered: invitations.filter((i) => i.status === "ANSWERED").length,
    reminderSent: invitations.filter((i) => i.reminderStatus === "SENT").length,
    reminderPending: invitations.filter((i) => i.reminderStatus === "PENDING").length,
  };

  const canSendNow =
    survey?.status === "SCHEDULED" &&
    scheduledSend?.status === "PENDING" &&
    event.participants.length > 0;

  // ── Server Actions ────────────────────────────────────────────────────────

  async function addParticipantsAction(formData: FormData) {
    "use server";
    await requireRole("DMU_ADMIN");
    if (await isParticipantListLocked(id)) {
      redirect(`/dmu/events/${id}?error=list_locked`);
    }

    const parsed = parseParticipants(String(formData.get("pasteData") ?? ""));
    if (parsed.participants.length === 0) {
      redirect(`/dmu/events/${id}?error=no_valid_participants`);
    }

    await prisma.eventParticipant.createMany({
      data: parsed.participants.map((p) => ({ ...p, eventId: id })),
      skipDuplicates: true,
    });

    revalidatePath(`/dmu/events/${id}`);
    revalidatePath("/dmu/calendar");
    redirect(`/dmu/events/${id}?success=participants_added&skipped=${parsed.skipped}`);
  }

  async function addSingleParticipantAction(formData: FormData) {
    "use server";
    await requireRole("DMU_ADMIN");
    if (await isParticipantListLocked(id)) {
      redirect(`/dmu/events/${id}?error=list_locked`);
    }

    const parsed = participantSchema.safeParse({
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
    });
    if (!parsed.success) {
      redirect(`/dmu/events/${id}?error=invalid_participant`);
    }

    await prisma.eventParticipant.upsert({
      where: { eventId_email: { eventId: id, email: parsed.data.email.toLowerCase() } },
      create: { eventId: id, email: parsed.data.email.toLowerCase(), name: parsed.data.name || null },
      update: { name: parsed.data.name || null },
    });

    revalidatePath(`/dmu/events/${id}`);
    revalidatePath("/dmu/calendar");
    redirect(`/dmu/events/${id}?success=participant_saved`);
  }

  async function removeParticipantAction(formData: FormData) {
    "use server";
    await requireRole("DMU_ADMIN");
    if (await isParticipantListLocked(id)) {
      redirect(`/dmu/events/${id}?error=list_locked`);
    }

    const participantId = String(formData.get("participantId") ?? "");
    if (!participantId) return;

    await prisma.eventParticipant.deleteMany({ where: { id: participantId, eventId: id } });
    revalidatePath(`/dmu/events/${id}`);
    revalidatePath("/dmu/calendar");
    redirect(`/dmu/events/${id}?success=participant_removed`);
  }

  async function closeSurveyAction() {
    "use server";
    await requireRole("DMU_ADMIN");

    if (!survey || survey.status !== "SENT") return;

    await prisma.surveyInstance.update({
      where: { id: survey.id },
      data: { status: "CLOSED", closesAt: new Date() },
    });

    revalidatePath(`/dmu/events/${id}`);
    revalidatePath("/dmu/calendar");
    revalidatePath("/dmu/dashboard");
  }

  async function sendNowAction() {
    "use server";
    await requireRole("DMU_ADMIN");

    if (!survey || survey.status !== "SCHEDULED") {
      redirect(`/dmu/events/${id}?error=cannot_send_now`);
    }

    // Sæt sendAt til nu så cron-logikken behandler den med det samme
    const send = survey.scheduledSends[0];
    if (send) {
      await prisma.scheduledSend.update({
        where: { id: send.id },
        data: { sendAt: new Date() },
      });
    }

    // Kald direkte (kører synkront – acceptabelt for en manuel trigger)
    await processDueScheduledSends();

    revalidatePath(`/dmu/events/${id}`);
    revalidatePath("/dmu/calendar");
    revalidatePath("/dmu/dashboard");
    redirect(`/dmu/events/${id}?success=sent_now`);
  }

  // ── Feedback messages ─────────────────────────────────────────────────────

  const status = surveyStatusLabel[survey?.status ?? "SCHEDULED"] ?? "Planlagt";

  const feedbackMessage =
    feedback.success === "participants_added"
      ? `Deltagerlisten er opdateret${Number(feedback.skipped ?? 0) > 0 ? `. ${feedback.skipped} ugyldige eller dublerede rækker blev sprunget over.` : "."}`
      : feedback.success === "participant_saved"
        ? "Deltageren er gemt."
        : feedback.success === "participant_removed"
          ? "Deltageren er fjernet."
          : feedback.success === "sent_now"
            ? `✓ Udsendelse igangsat – ${event.participants.length} invitationer er under afsendelse.`
            : feedback.error === "no_valid_participants"
              ? "Indsæt mindst én gyldig e-mailadresse."
              : feedback.error === "invalid_participant"
                ? "Kontrollér navn og e-mailadresse."
                : feedback.error === "list_locked"
                  ? "Deltagerlisten er låst, fordi spørgeskemaet allerede er sendt eller lukket."
                  : feedback.error === "cannot_send_now"
                    ? "Kan ikke sende nu – spørgeskemaet er ikke i planlagt tilstand."
                    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Topbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/dmu/calendar" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
          ← Tilbage til kalender
        </Link>
        <div className="flex items-center gap-2">
          {canSendNow && (
            <form action={sendNowAction}>
              <SubmitButton
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
                pendingText="Sender..."
              >
                Send nu
              </SubmitButton>
            </form>
          )}
          {survey?.status === "SENT" && (
            <form action={closeSurveyAction}>
              <SubmitButton
                className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-70"
                pendingText="Lukker..."
              >
                Luk spørgeskema
              </SubmitButton>
            </form>
          )}
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              status === "Sendt"
                ? "bg-emerald-100 text-emerald-900"
                : status === "Lukket"
                  ? "bg-stone-200 text-stone-900"
                  : "bg-sky-100 text-sky-900"
            }`}
          >
            {status}
          </span>
        </div>
      </div>

      {/* Event-info */}
      <section className="rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)] [&_p.text-muted-foreground]:text-white/75">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">Arrangement</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">{event.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{event.club.name} · {formatDate(event.eventDate)}</p>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-xl border border-white/12 bg-white/10 p-4">
            <p className="text-xs text-white/70">Lokation</p>
            <p className="mt-1 font-medium text-white">{event.location}</p>
          </article>
          <article className="rounded-xl border border-white/12 bg-white/10 p-4">
            <p className="text-xs text-white/70">Eventtype</p>
            <p className="mt-1 font-medium text-white">{event.eventType}</p>
          </article>
          <article className="rounded-xl border border-white/12 bg-white/10 p-4">
            <p className="text-xs text-white/70">Skabelon</p>
            <p className="mt-1 font-medium text-white">{survey?.surveyTemplate.name ?? "Ingen skabelon"}</p>
          </article>
          <article className="rounded-xl border border-white/12 bg-white/10 p-4">
            <p className="text-xs text-white/70">Sendetidspunkt</p>
            <p className="mt-1 font-medium text-white">{formatDateTime(scheduledSend?.sendAt)}</p>
          </article>
          <article className="rounded-xl border border-white/12 bg-white/10 p-4">
            <p className="text-xs text-white/70">Svarfrist</p>
            <p className="mt-1 font-medium text-white">{formatDateTime(survey?.closesAt)}</p>
          </article>
        </div>
      </section>

      {/* Feedback */}
      {feedbackMessage ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.error
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {feedbackMessage}
        </div>
      ) : null}

      {/* Leveringsstatus (vises kun efter udsendelse) */}
      {invitations.length > 0 && (
        <section className="rounded-xl border bg-background p-6">
          <h3 className="text-base font-semibold">Leveringsstatus</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Aggregeret oversigt – ingen persondata vises.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <article className="rounded-lg border bg-muted/20 p-4 text-center">
              <p className="text-2xl font-bold text-emerald-700">{inviteStats.answered}</p>
              <p className="mt-1 text-xs text-muted-foreground">Besvaret</p>
            </article>
            <article className="rounded-lg border bg-muted/20 p-4 text-center">
              <p className="text-2xl font-bold">{inviteStats.sent}</p>
              <p className="mt-1 text-xs text-muted-foreground">Invitationer leveret</p>
            </article>
            <article className="rounded-lg border bg-muted/20 p-4 text-center">
              <p className="text-2xl font-bold text-sky-700">{inviteStats.reminderSent}</p>
              <p className="mt-1 text-xs text-muted-foreground">Påmindelser sendt</p>
            </article>
            <article className="rounded-lg border bg-muted/20 p-4 text-center">
              <p className={`text-2xl font-bold ${inviteStats.failed > 0 ? "text-red-600" : ""}`}>
                {inviteStats.failed}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Leveringsfejl</p>
            </article>
          </div>
          {(inviteStats.pending > 0 || inviteStats.reminderPending > 0) && (
            <p className="mt-4 text-xs text-muted-foreground">
              {inviteStats.pending > 0 && `${inviteStats.pending} invitation(er) afventer afsendelse. `}
              {inviteStats.reminderPending > 0 && `${inviteStats.reminderPending} påmindelse(r) planlagt.`}
            </p>
          )}
        </section>
      )}

      {/* Deltagere */}
      <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold">Deltagere</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload listen på arrangementsdagen. Den bruges kun til denne udsendelse.
            </p>
          </div>
          <span className="rounded-full border bg-muted/30 px-3 py-1 text-sm text-muted-foreground">
            {event.participants.length} tilføjet
          </span>
        </div>

        {isLocked ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Deltagerlisten er låst, fordi spørgeskemaet allerede er sendt eller lukket.
          </div>
        ) : (
          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
            <form action={addParticipantsAction} className="rounded-2xl border bg-background p-5">
              <h4 className="font-semibold">Indsæt fra Excel</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Indsæt en e-mail pr. række, eller to kolonner med navn og e-mail.
              </p>
              <textarea
                name="pasteData"
                rows={8}
                required
                placeholder={"Mette Jensen\tmette@example.dk\nrasmus@example.dk"}
                className="mt-4 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <SubmitButton pendingText="Tilføjer..." className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                Tilføj deltagere
              </SubmitButton>
            </form>

            <form action={addSingleParticipantAction} className="rounded-2xl border bg-background p-5">
              <h4 className="font-semibold">Tilføj enkeltvis</h4>
              <div className="mt-4 space-y-3">
                <input
                  name="name"
                  placeholder="Navn (valgfrit)"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="navn@example.dk"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <SubmitButton pendingText="Gemmer..." className="mt-4 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
                Gem deltager
              </SubmitButton>
            </form>
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-2xl border">
          {event.participants.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Ingen deltagere er tilføjet endnu.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Navn</th>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Tilføjet</th>
                  <th className="px-4 py-3 text-right">Handling</th>
                </tr>
              </thead>
              <tbody>
                {event.participants.map((participant) => (
                  <tr key={participant.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{participant.name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{participant.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDateTime(participant.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {!isLocked ? (
                        <form action={removeParticipantAction}>
                          <input type="hidden" name="participantId" value={participant.id} />
                          <SubmitButton pendingText="Fjerner..." className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
                            Fjern
                          </SubmitButton>
                        </form>
                      ) : (
                        <span className="text-xs text-muted-foreground">Låst</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
