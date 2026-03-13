import Link from "next/link";
import { revalidatePath } from "next/cache";
import { processDueScheduledSends } from "@/lib/scheduled-sends";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DmuOutboxPage() {
  await requireRole("DMU_ADMIN");

  // Get all survey instances with invitations (unique instances only)
  const surveyInstancesWithStats = await prisma.surveyInstance.findMany({
    where: {
      invitations: {
        some: {}, // Has at least one invitation
      },
    },
    include: {
      club: true,
      _count: {
        select: {
          invitations: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // For each instance, get answered count
  const instancesWithCounts = await Promise.all(
    surveyInstancesWithStats.map(async (instance) => {
      const answeredCount = await prisma.surveyInvitation.count({
        where: {
          surveyInstanceId: instance.id,
          status: "ANSWERED",
        },
      });

      const sentAt = await prisma.mailLog.findFirst({
        where: {
          surveyInvitation: {
            surveyInstanceId: instance.id,
          },
        },
        select: { sentAt: true },
        orderBy: { sentAt: "asc" },
      });

      return {
        ...instance,
        answeredCount,
        sentAt: sentAt?.sentAt,
      };
    })
  );

  const [sentCount, answeredCount, pendingCount, dueCount] = await Promise.all([
    prisma.surveyInvitation.count({ where: { status: "SENT" } }),
    prisma.surveyInvitation.count({ where: { status: "ANSWERED" } }),
    prisma.scheduledSend.count({ where: { status: "PENDING" } }),
    prisma.scheduledSend.count({ where: { status: "PENDING", sendAt: { lte: new Date() } } }),
  ]);

  async function processScheduledSendsAction() {
    "use server";
    await requireRole("DMU_ADMIN");

    await processDueScheduledSends();

    revalidatePath("/dmu/outbox");
    revalidatePath("/dmu/events");
    revalidatePath("/club/outbox");
    revalidatePath("/club/events");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">DMU-udsendelser</h2>
        <p className="mt-2 text-sm text-muted-foreground">Samlet overblik over udsendelser på tværs af klubber.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Udsendelser</p>
            <p className="text-lg font-semibold">{instancesWithCounts.length}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Sendte invitationer</p>
            <p className="text-lg font-semibold">{sentCount}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Besvarede invitationer</p>
            <p className="text-lg font-semibold">{answeredCount}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Planlagte udsendelser</p>
            <p className="text-lg font-semibold">{pendingCount}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Klar til afsendelse nu</p>
            <p className="text-lg font-semibold">{dueCount}</p>
          </article>
        </div>

        <form action={processScheduledSendsAction} className="mt-4">
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Behandl planlagte udsendelser
          </button>
        </form>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Udsendelser pr. spørgeskema</h3>
        <div className="mt-4 space-y-3">
          {instancesWithCounts.length > 0 ? (
            instancesWithCounts.map((instance) => (
              <article key={instance.id} className="rounded-lg border p-4 hover:bg-muted/30 transition-colors">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{instance.club.name}</p>
                    <p className="text-sm text-muted-foreground mt-1">{instance.name}</p>
                    {instance.sentAt && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Sendt: {new Intl.DateTimeFormat("da-DK", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(instance.sentAt)}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-6 items-center">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Sendt til</p>
                      <p className="text-lg font-semibold">{instance._count.invitations}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Besvaret</p>
                      <p className="text-lg font-semibold text-green-600">{instance.answeredCount}</p>
                    </div>
                    <Link
                      href={`/dmu/outbox/${instance.id}`}
                      className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted whitespace-nowrap"
                    >
                      Se mails →
                    </Link>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Ingen udsendelser endnu.</p>
          )}
        </div>
      </section>
    </div>
  );
}
