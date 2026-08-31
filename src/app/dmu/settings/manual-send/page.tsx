import { revalidatePath } from "next/cache";
import { processDueScheduledSends } from "@/lib/scheduled-sends";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DmuDeliveryTabs } from "@/components/dmu-delivery-tabs";

export default async function ManualSendPage() {
  await requireRole("DMU_ADMIN");
  const now = new Date();

  const eligibleDueWhere = {
    status: "PENDING" as const,
    sendAt: { lte: now },
    surveyInstance: {
      OR: [
        { surveyType: { not: "EVENT" as const } },
        { clubReadyAt: { not: null } },
      ],
    },
  };

  const [pendingCount, dueScheduledSends] = await Promise.all([
    prisma.scheduledSend.count({ where: { status: "PENDING" } }),
    prisma.scheduledSend.findMany({
      where: eligibleDueWhere,
      include: {
        surveyInstance: {
          include: { club: true },
        },
      },
      orderBy: { sendAt: "asc" },
    }),
  ]);

  async function processScheduledSendsAction(formData: FormData) {
    "use server";
    await requireRole("DMU_ADMIN");

    const selectedIds = formData
      .getAll("scheduledSendIds")
      .map((v) => String(v))
      .filter(Boolean);

    if (selectedIds.length === 0) return;

    await processDueScheduledSends(selectedIds);

    revalidatePath("/dmu/settings/manual-send");
    revalidatePath("/dmu/settings/sends");
    revalidatePath("/dmu/calendar");
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
              Indstillinger
            </p>
            <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-white">
              Manuel udsendelse
            </h1>
            <p className="mt-2 text-sm text-white/70">
              Udsend planlagte spørgeskemaer manuelt uden at vente på den daglige kørsel.
            </p>
          </div>
          <DmuDeliveryTabs variant="dark" />
        </div>

        {/* Stat-kort */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[22px] border border-white/12 bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              Planlagte udsendelser
            </p>
            <p className="mt-2 font-heading text-3xl font-semibold text-white">{pendingCount}</p>
            <p className="mt-1 text-sm text-white/60">Afventer afsendelse</p>
          </div>
          <div className="rounded-[22px] border border-white/12 bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              Klar til afsendelse nu
            </p>
            <p className="mt-2 font-heading text-3xl font-semibold text-white">
              {dueScheduledSends.length}
            </p>
            <p className="mt-1 text-sm text-white/60">Sendetidspunkt er overskredet</p>
          </div>
        </div>
      </section>

      {/* Klar nu */}
      <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
        <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          Klar til afsendelse
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Udsendelser hvor sendetidspunktet er nået. Sæt kryds og tryk send.
        </p>

        <div className="mt-5">
          {dueScheduledSends.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-border/70 bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground">
              Ingen udsendelser er klar til manuel afsendelse lige nu.
              <br />
              <span className="mt-1 block text-xs">
                Den daglige automatiske udsendelse kører kl. 18:00.
              </span>
            </div>
          ) : (
            <form action={processScheduledSendsAction} className="space-y-3">
              <div className="space-y-2">
                {dueScheduledSends.map((send) => (
                  <label
                    key={send.id}
                    className="flex cursor-pointer items-center gap-3 rounded-[20px] border border-border/70 bg-background/80 p-4 transition hover:bg-muted/20"
                  >
                    <input
                      type="checkbox"
                      name="scheduledSendIds"
                      value={send.id}
                      defaultChecked
                      className="h-4 w-4 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{send.surveyInstance.club.name}</p>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {send.surveyInstance.name}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat("da-DK", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(send.sendAt)}
                    </span>
                  </label>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="rounded-2xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition hover:-translate-y-0.5 hover:bg-primary/90"
                >
                  Send valgte udsendelser
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
