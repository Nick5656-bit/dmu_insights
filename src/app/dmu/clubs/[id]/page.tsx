import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function DmuClubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const club = await prisma.club.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          members: true,
          surveyInstances: true,
          events: true,
          surveyResponses: true,
        },
      },
    },
  });

  if (!club) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">{club.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{club.city}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Medlemmer</p>
          <p className="mt-1 text-2xl font-semibold">{club._count.members}</p>
        </article>
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Spørgeskemaer</p>
          <p className="mt-1 text-2xl font-semibold">{club._count.surveyInstances}</p>
        </article>
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Arrangementer</p>
          <p className="mt-1 text-2xl font-semibold">{club._count.events}</p>
        </article>
        <article className="rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Svar</p>
          <p className="mt-1 text-2xl font-semibold">{club._count.surveyResponses}</p>
        </article>
      </section>
    </div>
  );
}
