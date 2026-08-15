import Link from "next/link";
import { notFound } from "next/navigation";
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
  SENT: "Sendt",
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

export default async function DmuOutboxDetailPage({ params }: { params: Promise<{ instanceId: string }> }) {
  await requireRole("DMU_ADMIN");

  const { instanceId } = await params;

  const surveyInstance = await prisma.surveyInstance.findUnique({
    where: { id: instanceId },
    include: {
      club: true,
    },
  });

  if (!surveyInstance) {
    notFound();
  }

  const mailLogs = await prisma.mailLog.findMany({
    where: {
      surveyInvitation: {
        surveyInstanceId: instanceId,
      },
    },
    include: {
      surveyInvitation: true,
    },
    orderBy: { sentAt: "desc" },
  });

  const sentCount = mailLogs.length;
  const failedCount = mailLogs.filter((l) => l.status === "FAILED").length;
  const answeredCount = mailLogs.filter((l) => l.surveyInvitation.status === "ANSWERED").length;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-background p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">{surveyInstance.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">Klub: {surveyInstance.club.name}</p>
          </div>
          <Link href="/dmu/settings/sends" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
            ← Tilbage til oversigt
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Sendte mails</p>
            <p className="text-lg font-semibold">{sentCount}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Fejlslagne</p>
            <p className="text-lg font-semibold text-red-600">{failedCount}</p>
          </article>
          <article className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Besvaret</p>
            <p className="text-lg font-semibold text-green-600">{answeredCount}</p>
          </article>
        </div>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold mb-4">Mails for denne udsendelse</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Emne</th>
                <th className="py-2 pr-4">Sendt</th>
                <th className="py-2 pr-4">Mail-status</th>
                <th className="py-2 pr-4">Invitation-status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {mailLogs.map((mailLog) => (
                <tr key={mailLog.id} className="hover:bg-muted/30">
                  <td className="py-3 pr-4 text-muted-foreground">{mailLog.toEmail}</td>
                  <td className="py-3 pr-4 max-w-[200px] truncate" title={mailLog.subject}>
                    {mailLog.subject}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                    {new Intl.DateTimeFormat("da-DK", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(mailLog.sentAt))}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${mailStatusColor[mailLog.status] ?? ""}`}>
                      {mailStatusLabel[mailLog.status] ?? mailLog.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${invitationStatusColor[mailLog.surveyInvitation.status] ?? ""}`}>
                      {invitationStatusLabel[mailLog.surveyInvitation.status] ?? mailLog.surveyInvitation.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {mailLogs.length === 0 && <p className="mt-4 text-sm text-muted-foreground">Ingen mails for denne udsendelse.</p>}
        </div>
      </section>
    </div>
  );
}
