import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mailLimit, MAIL_WINDOW_MS } from "@/lib/mail-policy";

type BudgetClient = Pick<Prisma.TransactionClient, "mailSendReservation" | "mailSendControl" | "mailLog">;

export async function readMailBudget(client: BudgetClient = prisma, now = new Date()) {
  const cutoff = new Date(now.getTime() - MAIL_WINDOW_MS);
  const [reservations, legacy, control] = await Promise.all([
    client.mailSendReservation.findMany({ where: { createdAt: { gt: cutoff } }, select: { createdAt: true }, orderBy: { createdAt: "asc" } }),
    // Include sends from the previous version on the migration day, without double counting new logs.
    client.mailLog.findMany({ where: { quotaTracked: false, sentAt: { gt: cutoff } }, select: { sentAt: true }, orderBy: { sentAt: "asc" } }),
    client.mailSendControl.findUnique({ where: { id: "brevo" } }),
  ]);
  const limit = mailLimit();
  const times = [...reservations.map((row) => row.createdAt), ...legacy.map((row) => row.sentAt)].sort((a, b) => a.getTime() - b.getTime());
  const blockedUntil = control?.blockedUntil && control.blockedUntil > now ? control.blockedUntil : null;
  const used = times.length;
  const remaining = blockedUntil ? 0 : Math.max(0, limit - used);
  const capacityAt = used >= limit && limit > 0 ? times[used - limit] : undefined;
  const retryAt = new Date(Math.max(
    now.getTime() + 60_000,
    capacityAt ? capacityAt.getTime() + MAIL_WINDOW_MS + 1000 : 0,
    blockedUntil?.getTime() ?? 0,
    limit === 0 ? now.getTime() + MAIL_WINDOW_MS : 0,
  ));
  return { limit, used, remaining, blockedUntil, retryAt };
}

export async function claimMailDelivery(where: Prisma.SurveyInvitationWhereInput, data: Prisma.SurveyInvitationUpdateManyMutationInput) {
  return prisma.$transaction(async (tx) => {
    // A database lock, shared by cron, manual sends, invitations AND reminders.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(731906, 300)::text`;
    const budget = await readMailBudget(tx);
    if (!budget.remaining) return { claimed: false, quota: true, retryAt: budget.retryAt };
    const claim = await tx.surveyInvitation.updateMany({ where, data });
    if (!claim.count) return { claimed: false, quota: false, retryAt: budget.retryAt };
    await tx.mailSendReservation.create({ data: {} });
    // Reservation and invitation claim commit together; never release a reservation after an ambiguous send.
    return { claimed: true, quota: false, retryAt: budget.retryAt };
  });
}

export async function pauseMailAccount(until: Date) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(731906, 300)::text`;
    const current = await tx.mailSendControl.findUnique({ where: { id: "brevo" } });
    const blockedUntil = new Date(Math.max(until.getTime(), current?.blockedUntil?.getTime() ?? 0));
    await tx.mailSendControl.upsert({ where: { id: "brevo" }, create: { id: "brevo", blockedUntil }, update: { blockedUntil } });
  });
}
