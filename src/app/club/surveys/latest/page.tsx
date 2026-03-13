import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ClubLatestSurveyPage() {
  const session = await requireRole("CLUB_ADMIN");

  if (!session.clubId) {
    return (
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">Seneste spørgeskema</h2>
        <p className="mt-2 text-sm text-muted-foreground">Brugeren mangler klubtilknytning.</p>
      </section>
    );
  }

  const latestSurvey = await prisma.surveyInstance.findFirst({
    where: { clubId: session.clubId },
    select: { id: true, name: true },
    orderBy: { createdAt: "desc" },
  });

  if (!latestSurvey) {
    return (
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">Seneste spørgeskema</h2>
        <p className="mt-2 text-sm text-muted-foreground">Der er ikke oprettet nogen spørgeskemaer endnu for klubben.</p>
        <div className="mt-4">
          <Link href="/club/surveys" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
            Gå til spørgeskemaoversigt
          </Link>
        </div>
      </section>
    );
  }

  redirect(`/club/surveys/${latestSurvey.id}`);
}
