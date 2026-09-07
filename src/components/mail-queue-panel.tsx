import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { readMailBudget } from "@/lib/mail-budget";
import { AUTOMATIC_SEND_DESCRIPTION } from "@/lib/mail-policy";

const dateLabel = (date: Date) => new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Copenhagen" }).format(date);

// Server component: callers must require DMU_ADMIN before rendering it.
export async function MailQueuePanel() {
  const [budget, pending, reminders, failed, latestJob, instances] = await Promise.all([
    readMailBudget(),
    prisma.surveyInvitation.count({ where: { deliveryStatus: { in: ["PENDING", "SENDING"] } } }),
    prisma.surveyInvitation.count({ where: { reminderStatus: { in: ["PENDING", "SENDING"] } } }),
    prisma.surveyInvitation.count({ where: { OR: [{ deliveryStatus: "FAILED" }, { reminderStatus: "FAILED" }] } }),
    prisma.systemJobRun.findFirst({ where: { jobName: "daily-maintenance" }, orderBy: { startedAt: "desc" } }),
    prisma.surveyInstance.findMany({
      where: { invitations: { some: { OR: [{ deliveryStatus: { in: ["PENDING", "SENDING", "FAILED"] } }, { reminderStatus: { in: ["PENDING", "SENDING", "FAILED"] } }] } } },
      orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, name: true, closesAt: true, club: { select: { name: true, isTest: true } },
        invitations: { select: { deliveryStatus: true, reminderStatus: true, lastDeliveryError: true, reminderLastError: true } } },
    }),
  ]);
  const now = new Date();
  const jobStale = !latestJob || latestJob.startedAt.getTime() < now.getTime() - 26 * 3600_000 || latestJob.status !== "SUCCEEDED";
  return <section className="space-y-4 rounded-[28px] border bg-card p-6">
    <h2 className="text-xl font-semibold">Mailkø og kapacitet</h2>
    <p className="text-sm text-muted-foreground">{AUTOMATIC_SEND_DESCRIPTION}</p>
    <div className="grid gap-3 sm:grid-cols-4">
      <p className="rounded-xl bg-muted/30 p-3"><strong className="block text-2xl">{budget.remaining} / {budget.limit}</strong>ledig kapacitet</p>
      <p className="rounded-xl bg-muted/30 p-3"><strong className="block text-2xl">{pending}</strong>invitationer i kø</p>
      <p className="rounded-xl bg-muted/30 p-3"><strong className="block text-2xl">{reminders}</strong>påmindelser planlagt/i kø</p>
      <p className="rounded-xl bg-muted/30 p-3"><strong className="block text-2xl">{failed}</strong>fejl, udløb eller kræver kontrol</p>
    </div>
    <p className="text-sm text-muted-foreground">Højst {budget.limit} afsendelsesforsøg over 24 timer, fælles for test, pilot, påmindelser og genforsøg. Usikre forsøg tæller også. Andre udsendelser direkte fra samme Brevo-konto bruger også Brevos kvote; de kan ikke ses i denne tæller. Brug derfor kontoen kun til platformen.</p>
    {!budget.remaining && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{budget.blockedUntil ? "Mailkontoen er sat på pause efter et svar fra Brevo." : "Mailgrænsen er nået."} {budget.limit === 0 ? "MAIL_DAILY_LIMIT er sat til 0 (afsendelse stoppet)." : `Tidligst ny kapacitet: ${dateLabel(budget.retryAt)}. Resten forsøges ved en efterfølgende automatisk kørsel, eller når du vælger den konkrete udsendelse nedenfor.`}</p>}
    <p role={jobStale ? "alert" : "status"} className={jobStale ? "text-sm text-amber-800" : "text-sm text-muted-foreground"}>Seneste automatiske kørsel: {latestJob ? `${dateLabel(latestJob.startedAt)} – ${latestJob.status}` : "endnu ikke registreret"}.{jobStale ? " Kontrollér cron og kørselsloggen i Vercel før pilotstart." : ""}</p>
    {instances.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Spørgeskema</th><th className="p-2">Accepteret af Brevo</th><th className="p-2">I kø</th><th className="p-2">Fejl/kontrol</th><th className="p-2">Lukker</th></tr></thead><tbody>{instances.map((instance) => {
      const accepted = instance.invitations.filter((i) => i.deliveryStatus === "SENT").length;
      const queued = instance.invitations.filter((i) => i.deliveryStatus === "PENDING" || i.deliveryStatus === "SENDING").length;
      const errors = instance.invitations.filter((i) => i.deliveryStatus === "FAILED" || i.reminderStatus === "FAILED");
      const error = errors[0]?.lastDeliveryError ?? errors[0]?.reminderLastError;
      return <tr key={instance.id} className="border-b"><td className="p-2"><Link className="underline" href={`/dmu/settings/sends/${instance.id}`}>{instance.name}</Link><p className="text-xs text-muted-foreground">{instance.club.name}{instance.club.isTest ? " · TEST" : ""}</p>{error && <p className="mt-1 max-w-md text-xs text-amber-800">{error}</p>}</td><td className="p-2">{accepted}</td><td className="p-2">{queued}</td><td className="p-2">{errors.length}</td><td className="p-2">{instance.closesAt ? dateLabel(instance.closesAt) : "Ingen dato"}</td></tr>;
    })}</tbody></table></div>}
    <p className="text-xs text-muted-foreground">Viser op til 100 udsendelser med kø/påmindelser/fejl. Accepteret af Brevo er ikke en bekræftelse på modtagelse i indbakken. Uafklaret leveringsstatus genudsendes ikke automatisk; kontrollér den i Brevo.</p>
  </section>;
}
