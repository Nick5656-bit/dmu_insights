import Link from "next/link";
import { SurveyStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createFromTemplateSchema = z.object({
  templateId: z.string().min(1),
  name: z.string().trim().min(3).optional(),
});

const surveyStatusLabels: Record<SurveyStatus, string> = {
  DRAFT: "Kladde",
  SCHEDULED: "Planlagt",
  SENT: "Sendt",
  CLOSED: "Lukket",
};

export default async function ClubSurveysPage() {
  const session = await requireRole("CLUB_ADMIN");
  if (!session.clubId) {
    return (
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">Klubbens spørgeskemaer</h2>
        <p className="mt-2 text-sm text-muted-foreground">Brugeren mangler klubtilknytning.</p>
      </section>
    );
  }

  const [templates, instances] = await Promise.all([
    prisma.surveyTemplate.findMany({
      where: { isActive: true },
      include: { _count: { select: { templateQuestions: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.surveyInstance.findMany({
      where: { clubId: session.clubId },
      include: {
        surveyTemplate: true,
        _count: {
          select: {
            surveyInstanceQuestions: true,
            invitations: true,
            responses: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  async function createSurveyInstanceFromTemplateAction(formData: FormData) {
    "use server";
    const currentSession = await requireRole("CLUB_ADMIN");
    if (!currentSession.clubId) {
      return;
    }

    const parsed = createFromTemplateSchema.safeParse({
      templateId: String(formData.get("templateId") ?? ""),
      name: String(formData.get("name") ?? ""),
    });

    if (!parsed.success) {
      return;
    }

    const template = await prisma.surveyTemplate.findUnique({
      where: { id: parsed.data.templateId },
      include: {
        templateQuestions: {
          orderBy: { sortOrder: "asc" },
          include: { question: true },
        },
      },
    });

    if (!template) {
      return;
    }

    const surveyInstance = await prisma.surveyInstance.create({
      data: {
        surveyTemplateId: template.id,
        clubId: currentSession.clubId,
        name: parsed.data.name?.trim() || `${template.name} - ${new Date().toLocaleDateString("da-DK")}`,
        surveyType: template.surveyType,
        status: "DRAFT",
        createdByUserId: currentSession.userId,
      },
    });

    if (template.templateQuestions.length > 0) {
      await prisma.surveyInstanceQuestion.createMany({
        data: template.templateQuestions.map((templateQuestion) => ({
          surveyInstanceId: surveyInstance.id,
          questionId: templateQuestion.questionId,
          sortOrder: templateQuestion.sortOrder,
          required: templateQuestion.required,
          sourceType: "CORE",
        })),
      });
    }

    revalidatePath("/club/surveys");
    redirect(`/club/surveys/${surveyInstance.id}`);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">Klubbens spørgeskemaer</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Opret spørgeskema ud fra en DMU-skabelon og tilføj egne spørgsmål i næste trin.
        </p>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Opret spørgeskema fra skabelon</h3>
        <form action={createSurveyInstanceFromTemplateAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <label htmlFor="templateId" className="text-sm font-medium">
              Vælg skabelon
            </label>
            <select id="templateId" name="templateId" required className="w-full rounded-md border px-3 py-2 text-sm">
              <option value="">Vælg skabelon</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.surveyType} · {template._count.templateQuestions} spørgsmål)
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1 md:col-span-2">
            <label htmlFor="name" className="text-sm font-medium">
              Navn på spørgeskema (valgfrit)
            </label>
            <input id="name" name="name" className="w-full rounded-md border px-3 py-2 text-sm" placeholder="fx Årlig måling 2026 - Klubnavn" />
          </div>

          <div className="md:col-span-2">
            <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Opret spørgeskema
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Eksisterende spørgeskemaer</h3>
        <div className="mt-4 space-y-3">
          {instances.map((instance) => (
            <article key={instance.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{instance.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {instance.surveyTemplate.name} · Status: {surveyStatusLabels[instance.status]}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Spørgsmål: {instance._count.surveyInstanceQuestions} · Invitationer: {instance._count.invitations} · Svar: {instance._count.responses}
                  </p>
                </div>

                <Link
                  href={`/club/surveys/${instance.id}`}
                  className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted"
                >
                  Åbn survey
                </Link>
              </div>
            </article>
          ))}
          {instances.length === 0 ? <p className="text-sm text-muted-foreground">Ingen spørgeskemaer endnu.</p> : null}
        </div>
      </section>
    </div>
  );
}
