import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CalendarDays, ClipboardList, Plus, Sparkles } from "lucide-react";
import { SurveyStatus, SurveyType } from "@prisma/client";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SubmitButton } from "@/components/submit-button";

const createFromTemplateSchema = z.object({
  templateId: z.string().min(1),
  name: z.string().trim().min(3).optional(),
});

const createLocalSurveySchema = z.object({
  name: z.string().trim().min(3),
  surveyType: z.nativeEnum(SurveyType),
});

const surveyTypeLabel: Record<SurveyType, string> = {
  ANNUAL: "Årlig",
  EVENT: "Arrangement",
};

const surveyStatusLabels: Record<SurveyStatus, string> = {
  DRAFT: "Kladde",
  SCHEDULED: "Planlagt",
  SENT: "Sendt",
  CLOSED: "Lukket",
};

const surveyStatusTone: Record<SurveyStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-800",
  SCHEDULED: "bg-sky-100 text-sky-900",
  SENT: "bg-emerald-100 text-emerald-900",
  CLOSED: "bg-stone-200 text-stone-900",
};

function formatDate(value: Date | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

export default async function ClubSurveysPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireRole("CLUB_ADMIN");
  const { status } = await searchParams;
  const statusFilter =
    status === "DRAFT" || status === "SCHEDULED" || status === "SENT" || status === "CLOSED"
      ? (status as SurveyStatus)
      : undefined;

  if (!session.clubId) {
    return (
      <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Klubbens spørgeskemaer</h1>
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
      where: {
        clubId: session.clubId,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
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
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 100,
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

  async function createLocalSurveyAction(formData: FormData) {
    "use server";
    const currentSession = await requireRole("CLUB_ADMIN");
    if (!currentSession.clubId) {
      return;
    }

    const parsed = createLocalSurveySchema.safeParse({
      name: String(formData.get("name") ?? ""),
      surveyType: String(formData.get("surveyType") ?? "ANNUAL") as SurveyType,
    });

    if (!parsed.success) {
      return;
    }

    let localTemplate = await prisma.surveyTemplate.findFirst({
      where: {
        name: "Lokalt klubspørgeskema (intern)",
        surveyType: parsed.data.surveyType,
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    if (!localTemplate) {
      localTemplate = await prisma.surveyTemplate.create({
        data: {
          name: "Lokalt klubspørgeskema (intern)",
          description: "Intern teknisk skabelon til lokale klubspørgeskemaer uden DMU-spørgsmål.",
          surveyType: parsed.data.surveyType,
          isActive: false,
          layoutJson: { version: 1, items: [] },
        },
        select: { id: true },
      });
    }

    const surveyInstance = await prisma.surveyInstance.create({
      data: {
        surveyTemplateId: localTemplate.id,
        clubId: currentSession.clubId,
        name: parsed.data.name,
        surveyType: parsed.data.surveyType,
        status: "DRAFT",
        createdByUserId: currentSession.userId,
      },
    });

    revalidatePath("/club/surveys");
    redirect(`/club/surveys/${surveyInstance.id}`);
  }

  const annualTemplateCount = templates.filter((template) => template.surveyType === "ANNUAL").length;
  const eventTemplateCount = templates.filter((template) => template.surveyType === "EVENT").length;
  const totalResponses = instances.reduce((sum, instance) => sum + instance._count.responses, 0);

  const summaryCards = [
    { label: "Spørgeskemaer", value: instances.length, hint: "I klubben" },
    { label: "Skabeloner", value: templates.length, hint: `${annualTemplateCount} årlige · ${eventTemplateCount} event` },
    { label: "Svar", value: totalResponses, hint: "Samlet på viste spørgeskemaer" },
  ];

  return (
    <div className="space-y-6">
      <section className="overflow-visible rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl space-y-4">
            <span className="inline-flex w-fit items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/90">
              Spørgeskemaer
            </span>
            <div className="space-y-2 text-white/75 [&_h1]:text-white [&_p]:text-white/75">
              <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Styr klubbens spørgeskemaer</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">Opret nyt fra en skabelon eller start et lokalt spørgeskema med samme flow som i dag.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/85">
                Status: {statusFilter ? surveyStatusLabels[statusFilter] : "Alle"}
              </span>
              <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/85">
                {templates.length} aktive skabeloner
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="#nyt-sporgeskema"
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Nyt spørgeskema
            </a>
            <Link
              href="/club/outbox"
              className="inline-flex h-11 items-center rounded-2xl border border-white/15 bg-white/10 px-5 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-white/16"
            >
              Udsendelser
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {summaryCards.map((card) => (
          <article key={card.label} className="rounded-[24px] border border-border/70 bg-card p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{card.label}</p>
            <p className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground">{card.value}</p>
            <p className="mt-2 text-sm text-muted-foreground">{card.hint}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Spørgeskemaer</h2>
            <p className="mt-1 text-sm text-muted-foreground">Åbn, redigér og følg status på klubbens spørgeskemaer.</p>
          </div>

          <form method="get" className="flex flex-wrap gap-3">
            <select name="status" defaultValue={statusFilter ?? ""} className="h-11 rounded-2xl border border-border/70 bg-background px-3 text-sm">
              <option value="">Alle statusser</option>
              <option value="DRAFT">Kladde</option>
              <option value="SCHEDULED">Planlagt</option>
              <option value="SENT">Sendt</option>
              <option value="CLOSED">Lukket</option>
            </select>
            <button
              type="submit"
              className="h-11 rounded-2xl border border-border/70 bg-background px-5 text-sm font-medium text-foreground transition hover:bg-muted/40"
            >
              Filtrer
            </button>
            {statusFilter ? (
              <Link
                href="/club/surveys"
                className="flex h-11 items-center justify-center rounded-2xl border border-border/70 px-5 text-sm font-medium text-muted-foreground transition hover:bg-muted/40"
              >
                Nulstil
              </Link>
            ) : null}
          </form>
        </div>

        {instances.length > 0 ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {instances.map((instance) => {
              const responseRate = instance._count.invitations > 0 ? Math.round((instance._count.responses / instance._count.invitations) * 100) : 0;
              const TypeIcon = instance.surveyType === "EVENT" ? CalendarDays : ClipboardList;
              const accentClass = instance.surveyType === "EVENT" ? "bg-sky-50 text-sky-700" : "bg-emerald-50 text-emerald-700";

              return (
                <article key={instance.id} className="rounded-[24px] border border-border/70 bg-background/90 p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`inline-flex rounded-2xl p-3 ${accentClass}`}>
                        <TypeIcon className="h-5 w-5" />
                      </div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-foreground">{instance.name}</h3>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${surveyStatusTone[instance.status]}`}>
                            {surveyStatusLabels[instance.status]}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{instance.surveyTemplate.name}</p>
                      </div>
                    </div>
                    <span className="rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground">
                      {surveyTypeLabel[instance.surveyType]}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Spørgsmål</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{instance._count.surveyInstanceQuestions}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Invitationer</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{instance._count.invitations}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Svar</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{instance._count.responses}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Svarrate</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{responseRate}%</p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">Opdateret {formatDate(instance.updatedAt)}</p>
                    <Link
                      href={`/club/surveys/${instance.id}`}
                      className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border/70 px-4 text-sm font-semibold text-foreground transition hover:bg-muted/40"
                    >
                      Åbn
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-[22px] border border-dashed border-border/70 bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground">
            Ingen spørgeskemaer matcher filtret.
          </div>
        )}
      </section>

      <section id="nyt-sporgeskema" className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Nyt spørgeskema</p>
              <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-foreground">Fra skabelon</h2>
            </div>
            <span className="rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground">
              Hurtig start
            </span>
          </div>

          <form action={createSurveyInstanceFromTemplateAction} className="mt-5 space-y-4">
            <div className="space-y-2">
              <label htmlFor="templateId" className="text-sm font-medium text-foreground">
                Skabelon
              </label>
              <select id="templateId" name="templateId" required className="h-11 w-full rounded-2xl border border-border/70 bg-background px-3 text-sm">
                <option value="">Vælg skabelon</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({surveyTypeLabel[template.surveyType]} · {template._count.templateQuestions} spørgsmål)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium text-foreground">
                Navn
              </label>
              <input id="name" name="name" className="h-11 w-full rounded-2xl border border-border/70 bg-background px-3 text-sm" placeholder="Valgfrit navn" />
            </div>

            <SubmitButton pendingText="Opretter..." className="inline-flex h-11 items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:bg-primary/90">
              <Sparkles className="h-4 w-4" />
              Opret fra skabelon
            </SubmitButton>
          </form>
        </section>

        <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Nyt spørgeskema</p>
              <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-foreground">Lokalt spørgeskema</h2>
            </div>
            <span className="rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground">
              Fleksibelt
            </span>
          </div>

          <form action={createLocalSurveyAction} className="mt-5 space-y-4">
            <div className="space-y-2">
              <label htmlFor="localName" className="text-sm font-medium text-foreground">
                Navn
              </label>
              <input
                id="localName"
                name="name"
                required
                className="h-11 w-full rounded-2xl border border-border/70 bg-background px-3 text-sm"
                placeholder="Fx Frivilligtrivsel forår 2026"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="localSurveyType" className="text-sm font-medium text-foreground">
                Type
              </label>
              <select id="localSurveyType" name="surveyType" defaultValue="ANNUAL" className="h-11 w-full rounded-2xl border border-border/70 bg-background px-3 text-sm">
                <option value="ANNUAL">Årlig måling</option>
                <option value="EVENT">Arrangement</option>
              </select>
            </div>

            <SubmitButton pendingText="Opretter..." className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border/70 px-5 text-sm font-semibold text-foreground transition hover:bg-muted/40">
              <Plus className="h-4 w-4" />
              Opret lokalt
            </SubmitButton>
          </form>
        </section>
      </section>
    </div>
  );
}
