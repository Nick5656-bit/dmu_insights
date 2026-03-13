import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const invitationStatusLabel: Record<string, string> = {
  SENT: "Sendt",
  OPENED: "Åbnet",
  ANSWERED: "Besvaret",
  EXPIRED: "Udløbet",
};

export default async function ClubOutboxPage() {
  const session = await requireRole("CLUB_ADMIN");

  const mailLogs = await prisma.mailLog.findMany({
    where: {
      surveyInvitation: {
        surveyInstance: {
          clubId: session.clubId ?? undefined,
        },
      },
    },
    include: {
      surveyInvitation: {
        include: {
          surveyInstance: true,
        },
      },
    },
    orderBy: { sentAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">Klubbens udsendelser</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Mock mails sendt til klubbens medlemmer. Linket åbner den offentlige spørgeskemaside.
        </p>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Tidspunkt</th>
                <th className="py-2 pr-4">Spørgeskema</th>
                <th className="py-2 pr-4">Til</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Svarstatus</th>
                <th className="py-2">Link</th>
              </tr>
            </thead>
            <tbody>
              {mailLogs.map((mailLog) => (
                <tr key={mailLog.id} className="border-b align-top">
                  <td className="py-2 pr-4 text-muted-foreground">{new Date(mailLog.sentAt).toLocaleString("da-DK")}</td>
                  <td className="py-2 pr-4">{mailLog.surveyInvitation.surveyInstance.name}</td>
                  <td className="py-2 pr-4">{mailLog.toEmail}</td>
                  <td className="py-2 pr-4">{mailLog.status === "SENT" ? "Sendt" : mailLog.status}</td>
                  <td className="py-2 pr-4">{invitationStatusLabel[mailLog.surveyInvitation.status] ?? mailLog.surveyInvitation.status}</td>
                  <td className="py-2">
                    <Link href={`/survey/${mailLog.surveyInvitation.token}`} className="text-primary underline">
                      Åbn spørgeskema-link
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {mailLogs.length === 0 ? <p className="text-sm text-muted-foreground">Ingen mock mails endnu.</p> : null}
        </div>
      </section>
    </div>
  );
}
