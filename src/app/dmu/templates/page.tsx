import { SurveyType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DetachedSubmitButton, SubmitButton } from "@/components/submit-button";
import { TemplateStructureEditor } from "./template-structure-editor";
import { TemplateCreatedNotice } from "./template-created-notice";

const createTemplateSchema = z.object({
  name: z.string().trim().min(3),
  description: z.string().trim().min(1),
  surveyType: z.nativeEnum(SurveyType),
  questionIds: z.array(z.string().min(1)).optional().default([]),
});

const updateTemplateSchema = z.object({
  templateId: z.string().min(1),
  name: z.string().trim().min(3),
  description: z.string().trim().min(5),
  surveyType: z.nativeEnum(SurveyType),
});

const structureItemSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().min(1),
    kind: z.literal("HEADING"),
    title: z.string().trim().min(1),
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("QUESTION"),
    questionId: z.string().min(1),
    required: z.boolean().optional(),
    isCore: z.boolean().optional(),
  }),
]);

const saveStructureSchema = z.object({
  templateId: z.string().min(1),
  structureJson: z.string().min(1),
});

const layoutJsonSchema = z.object({
  version: z.number().int().positive(),
  items: z.array(structureItemSchema),
});

const surveyTypeLabels: Record<SurveyType, string> = {
  ANNUAL: "Årlig",
  EVENT: "Arrangement",
};

function normalizeKeyPart(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/Æ/g, "AE")
    .replace(/Ø/g, "OE")
    .replace(/Å/g, "AA")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .replace(/_{2,}/g, "_");
}

type DmuTemplatesPageProps = {
  searchParams: Promise<{
    benchmarkCategory?: string;
    created?: string;
  }>;
};

export default async function DmuTemplatesPage({ searchParams }: DmuTemplatesPageProps) {
  await requireRole("DMU_ADMIN");
  const params = await searchParams;
  const selectedCategoryFilter =
    params.benchmarkCategory === "NO_BENCHMARK"
      ? "NO_BENCHMARK"
      : normalizeKeyPart(params.benchmarkCategory ?? "") || "";

  const [questions, questionCategorySource, templates] = await Promise.all([
    prisma.question.findMany({
      where: {
        scope: "DMU_STANDARD",
        active: true,
        ...(selectedCategoryFilter === "NO_BENCHMARK"
          ? { benchmarkKey: null }
          : selectedCategoryFilter
            ? { benchmarkKey: { startsWith: `${selectedCategoryFilter}_` } }
            : {}),
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.question.findMany({
      where: {
        scope: "DMU_STANDARD",
        active: true,
        benchmarkKey: { not: null },
      },
      select: { benchmarkKey: true },
    }),
    prisma.surveyTemplate.findMany({
      include: {
        _count: {
          select: {
            surveyInstances: true,
          },
        },
        templateQuestions: {
          include: { question: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const benchmarkCategoryOptions = [...new Set(
    questionCategorySource
      .map((question) => normalizeKeyPart(question.benchmarkKey?.split("_")[0] ?? ""))
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "da"));
  const createdTemplateId = templates.some((template) => template.id === params.created) ? params.created : undefined;

  async function createTemplateAction(formData: FormData) {
    "use server";
    await requireRole("DMU_ADMIN");

    const questionIds = formData
      .getAll("questionIds")
      .map((value) => String(value))
      .filter(Boolean);

    const parsed = createTemplateSchema.safeParse({
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      surveyType: String(formData.get("surveyType") ?? "") as SurveyType,
      questionIds,
    });

    if (!parsed.success) {
      return;
    }

    const selectedQuestions = await prisma.question.findMany({
      where: {
        id: { in: parsed.data.questionIds },
        scope: "DMU_STANDARD",
      },
      select: {
        id: true,
        benchmarkKey: true,
      },
    });

    const template = await prisma.surveyTemplate.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        surveyType: parsed.data.surveyType,
        isActive: false,
      },
    });

    const selectedOrderMap = new Map(parsed.data.questionIds.map((questionId, index) => [questionId, index + 1]));
    const createRows = selectedQuestions
      .sort((left, right) => (selectedOrderMap.get(left.id) ?? 0) - (selectedOrderMap.get(right.id) ?? 0))
      .map((question) => ({
        surveyTemplateId: template.id,
        questionId: question.id,
        sortOrder: selectedOrderMap.get(question.id) ?? 1,
        required: true,
        isCoreBenchmarkQuestion: Boolean(question.benchmarkKey),
      }));

    if (createRows.length > 0) {
      await prisma.surveyTemplateQuestion.createMany({ data: createRows });
    }
    await prisma.surveyTemplate.update({
      where: { id: template.id },
      data: {
        layoutJson: {
          version: 1,
          items: createRows.map((row) => ({
            id: `question-${row.questionId}`,
            kind: "QUESTION",
            questionId: row.questionId,
            required: row.required,
            isCore: row.isCoreBenchmarkQuestion,
          })),
        },
      },
    });

    revalidatePath("/dmu/templates");
    redirect(`/dmu/templates?created=${template.id}`);
  }

  async function updateTemplateAction(formData: FormData) {
    "use server";
    await requireRole("DMU_ADMIN");

    const parsed = updateTemplateSchema.safeParse({
      templateId: String(formData.get("templateId") ?? ""),
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      surveyType: String(formData.get("surveyType") ?? "") as SurveyType,
    });

    if (!parsed.success) {
      return;
    }

    await prisma.surveyTemplate.update({
      where: { id: parsed.data.templateId },
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        surveyType: parsed.data.surveyType,
      },
    });

    revalidatePath("/dmu/templates");
  }

  async function deleteTemplateAction(formData: FormData) {
    "use server";
    await requireRole("DMU_ADMIN");

    const templateId = String(formData.get("templateId") ?? "");
    if (!templateId) {
      return;
    }

    const instanceCount = await prisma.surveyInstance.count({
      where: { surveyTemplateId: templateId },
    });

    if (instanceCount > 0) {
      return;
    }

    await prisma.surveyTemplate.delete({
      where: { id: templateId },
    });

    revalidatePath("/dmu/templates");
  }

  async function toggleTemplateAvailabilityAction(formData: FormData) {
    "use server";
    await requireRole("DMU_ADMIN");

    const templateId = String(formData.get("templateId") ?? "");
    const nextIsActive = String(formData.get("nextIsActive") ?? "") === "true";
    if (!templateId) {
      return;
    }

    await prisma.surveyTemplate.update({
      where: { id: templateId },
      data: { isActive: nextIsActive },
    });

    revalidatePath("/dmu/templates");
    revalidatePath("/club/surveys");
  }

  async function saveTemplateStructureAction(
    _previousState: { status: "idle" | "success" | "error"; message: string },
    formData: FormData,
  ) {
    "use server";
    await requireRole("DMU_ADMIN");

    const parsedPayload = saveStructureSchema.safeParse({
      templateId: String(formData.get("templateId") ?? ""),
      structureJson: String(formData.get("structureJson") ?? ""),
    });

    if (!parsedPayload.success) {
      return { status: "error" as const, message: "Kunne ikke læse ændringerne. Prøv igen." };
    }

    let rawLayout: unknown;
    try {
      rawLayout = JSON.parse(parsedPayload.data.structureJson);
    } catch {
      return { status: "error" as const, message: "Kunne ikke læse ændringerne. Prøv igen." };
    }
    const parsedLayout = layoutJsonSchema.safeParse(rawLayout);
    if (!parsedLayout.success) {
      return { status: "error" as const, message: "Afsnit eller spørgsmål er ikke gyldigt udfyldt." };
    }

    const questionItems = parsedLayout.data.items.filter((item) => item.kind === "QUESTION");
    const uniqueQuestionIds = [...new Set(questionItems.map((item) => item.questionId))];
    const [existingRows, questionsForTemplate] = await Promise.all([
      prisma.surveyTemplateQuestion.findMany({
        where: { surveyTemplateId: parsedPayload.data.templateId },
        select: { id: true, questionId: true },
      }),
      prisma.question.findMany({
        where: {
          id: { in: uniqueQuestionIds },
          scope: "DMU_STANDARD",
        },
        select: {
          id: true,
          benchmarkKey: true,
        },
      }),
    ]);

    if (questionsForTemplate.length !== uniqueQuestionIds.length) {
      return { status: "error" as const, message: "Et af spørgsmålene findes ikke længere. Genindlæs siden og prøv igen." };
    }

    const questionById = new Map(questionsForTemplate.map((question) => [question.id, question]));
    const existingByQuestionId = new Map(existingRows.map((row) => [row.questionId, row]));

    let sortOrder = 1;
    try {
      await prisma.$transaction(async (transaction) => {
        await transaction.surveyTemplateQuestion.deleteMany({
          where: {
            surveyTemplateId: parsedPayload.data.templateId,
            questionId: { notIn: uniqueQuestionIds },
          },
        });

        for (const item of parsedLayout.data.items) {
          if (item.kind !== "QUESTION") {
            continue;
          }

          const question = questionById.get(item.questionId);
          if (!question) {
            continue;
          }

          const nextRequired = item.required ?? true;
          const nextIsCore = item.isCore === true && Boolean(question.benchmarkKey);
          const existing = existingByQuestionId.get(item.questionId);

          if (existing) {
            await transaction.surveyTemplateQuestion.update({
              where: { id: existing.id },
              data: {
                sortOrder,
                required: nextRequired,
                isCoreBenchmarkQuestion: nextIsCore,
              },
            });
          } else {
            await transaction.surveyTemplateQuestion.create({
              data: {
                surveyTemplateId: parsedPayload.data.templateId,
                questionId: item.questionId,
                sortOrder,
                required: nextRequired,
                isCoreBenchmarkQuestion: nextIsCore,
              },
            });
          }

          sortOrder += 1;
        }

        await transaction.surveyTemplate.update({
          where: { id: parsedPayload.data.templateId },
          data: {
            layoutJson: {
              version: 1,
              items: parsedLayout.data.items,
            },
          },
        });
      });
    } catch (error) {
      console.error("[templates] Kunne ikke gemme skabelonstruktur", error);
      return { status: "error" as const, message: "Kunne ikke gemme ændringerne. Prøv igen." };
    }

    revalidatePath("/dmu/templates");
    return { status: "success" as const, message: "Gemt" };
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)] [&_p.text-muted-foreground]:text-white/75">
        <div>
          <div className="text-white/75 [&_h1]:text-white [&_p]:text-white/75">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Spørgsmål & skabeloner</p>
            <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-foreground">Skabeloner</h1>
            <p className="mt-2 text-sm text-muted-foreground">Byg spørgeskemaer af standardspørgsmål.</p>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Ny skabelon</h2>

        <form id="create-template-form" action={createTemplateAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <label htmlFor="name" className="text-sm font-medium">
              Navn på skabelon
            </label>
            <input id="name" name="name" required className="w-full rounded-md border px-3 py-2 text-sm" />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label htmlFor="description" className="text-sm font-medium">
              Beskrivelse
            </label>
            <input id="description" name="description" required className="w-full rounded-md border px-3 py-2 text-sm" />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label htmlFor="surveyType" className="text-sm font-medium">
              Type
            </label>
            <select id="surveyType" name="surveyType" defaultValue="ANNUAL" className="w-full rounded-md border px-3 py-2 text-sm">
              <option value="ANNUAL">Årlig</option>
              <option value="EVENT">Arrangement</option>
            </select>
          </div>
        </form>

        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium">Vælg spørgsmål</p>

          <form method="get" className="grid gap-3 md:grid-cols-[1fr_auto]" action="/dmu/templates">
            <select name="benchmarkCategory" defaultValue={selectedCategoryFilter} className="h-10 rounded-md border px-3 text-sm">
              <option value="">Alle benchmark-kategorier</option>
              <option value="NO_BENCHMARK">Ingen benchmark</option>
              {benchmarkCategoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button type="submit" className="h-10 rounded-md border px-3 text-sm font-medium hover:bg-muted">
                Filtrer
              </button>
              {selectedCategoryFilter ? (
                <a href="/dmu/templates" className="flex h-10 items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-muted">
                  Nulstil
                </a>
              ) : null}
            </div>
          </form>

          <div className="max-h-56 space-y-2 overflow-auto rounded-md border p-3">
            {questions.map((question) => (
              <label key={question.id} className="grid grid-cols-[20px_1fr] items-start gap-2 rounded-md p-1.5 text-sm hover:bg-muted/30">
                <input type="checkbox" name="questionIds" value={question.id} form="create-template-form" className="mt-0.5 h-4 w-4" />
                <span className="leading-5">
                  <span className="font-medium">{question.title}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({question.questionType === "SCALE_1_5" ? "Skala 1-5" : question.questionType === "SINGLE_CHOICE" ? "Valgmuligheder" : "Tekst"}
                    {question.benchmarkKey ? ` · ${question.benchmarkKey}` : ""})
                  </span>
                </span>
              </label>
            ))}
            {questions.length === 0 ? <p className="text-sm text-muted-foreground">Ingen aktive standardspørgsmål.</p> : null}
          </div>

          <DetachedSubmitButton form="create-template-form" pendingText="Opretter skabelon..." className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Opret skabelon
          </DetachedSubmitButton>
        </div>
      </section>

      <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Skabeloner</h2>
            <p className="mt-1 text-sm text-muted-foreground">{templates.length} i alt</p>
          </div>
        </div>
        {createdTemplateId ? <TemplateCreatedNotice templateId={createdTemplateId} /> : null}
        <div className="mt-4 space-y-3">
          {templates.map((template) => (
            <details
              key={template.id}
              id={`template-${template.id}`}
              tabIndex={-1}
              className={`rounded-lg border p-4 ${template.id === createdTemplateId ? "template-created-highlight" : ""}`}
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{template.name}</p>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        template.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {template.isActive ? "Offentliggjort" : "Ikke offentliggjort"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Type: {surveyTypeLabels[template.surveyType]} · {template.templateQuestions.length} spørgsmål · Brugt i {template._count.surveyInstances} surveys
                  </p>
                </div>
                <span className="rounded-md border px-3 py-1.5 text-xs font-medium">Rediger</span>
              </summary>

              <div className="mt-4 space-y-2 border-t pt-4">
                <form action={updateTemplateAction} className="grid gap-3 md:grid-cols-2">
                  <input type="hidden" name="templateId" value={template.id} />
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor={`template-name-${template.id}`}>
                      Navn
                    </label>
                    <input
                      id={`template-name-${template.id}`}
                      name="name"
                      defaultValue={template.name}
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor={`template-type-${template.id}`}>
                      Type
                    </label>
                    <select
                      id={`template-type-${template.id}`}
                      name="surveyType"
                      defaultValue={template.surveyType}
                      className="w-full rounded-md border px-3 py-2 text-sm"
                    >
                      <option value="ANNUAL">Årlig</option>
                      <option value="EVENT">Arrangement</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor={`template-description-${template.id}`}>
                      Beskrivelse
                    </label>
                    <input
                      id={`template-description-${template.id}`}
                      name="description"
                      defaultValue={template.description}
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      required
                    />
                  </div>
                  <div className="md:col-span-2 flex items-center justify-end">
                    <SubmitButton pendingText="Gemmer..." className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                      Gem skabelon
                    </SubmitButton>
                  </div>
                </form>

                <TemplateStructureEditor
                    templateId={template.id}
                    initialItems={(() => {
                      const parsedLayout = layoutJsonSchema.safeParse(template.layoutJson);
                      const questionById = new Map(template.templateQuestions.map((item) => [item.questionId, item]));
                      const hydrated: Array<
                        | { id: string; kind: "HEADING"; title: string }
                        | { id: string; kind: "QUESTION"; questionId: string; required: boolean; isCore: boolean }
                      > = [];

                      if (parsedLayout.success) {
                        for (const item of parsedLayout.data.items) {
                          if (item.kind === "HEADING") {
                            hydrated.push({
                              id: item.id,
                              kind: "HEADING",
                              title: item.title,
                            });
                            continue;
                          }

                          const existingQuestion = questionById.get(item.questionId);
                          if (!existingQuestion) {
                            continue;
                          }

                          hydrated.push({
                            id: item.id,
                            kind: "QUESTION",
                            questionId: item.questionId,
                            required: item.required ?? existingQuestion.required,
                            isCore: item.isCore ?? existingQuestion.isCoreBenchmarkQuestion,
                          });
                        }
                      }

                      const existingIds = new Set(
                        hydrated.filter((item): item is { id: string; kind: "QUESTION"; questionId: string; required: boolean; isCore: boolean } => item.kind === "QUESTION").map((item) => item.questionId),
                      );

                      for (const templateQuestion of template.templateQuestions) {
                        if (existingIds.has(templateQuestion.questionId)) {
                          continue;
                        }

                        hydrated.push({
                          id: `question-${templateQuestion.questionId}`,
                          kind: "QUESTION",
                          questionId: templateQuestion.questionId,
                          required: templateQuestion.required,
                          isCore: templateQuestion.isCoreBenchmarkQuestion,
                        });
                      }

                      return hydrated;
                    })()}
                    questionPool={questions.map((question) => ({
                      id: question.id,
                      title: question.title,
                      questionType: question.questionType,
                      benchmarkKey: question.benchmarkKey,
                    }))}
                    questionMeta={template.templateQuestions.map((item) => ({
                      id: item.question.id,
                      title: item.question.title,
                      questionType: item.question.questionType,
                      benchmarkKey: item.question.benchmarkKey,
                    }))}
                    saveAction={saveTemplateStructureAction}
                />

                <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                  <form action={toggleTemplateAvailabilityAction}>
                    <input type="hidden" name="templateId" value={template.id} />
                    <input type="hidden" name="nextIsActive" value={template.isActive ? "false" : "true"} />
                    <SubmitButton
                      pendingText={template.isActive ? "Skjuler..." : "Offentliggør..."}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                        template.isActive
                          ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      }`}
                    >
                      {template.isActive ? "Skjul for klubber" : "Offentliggør til klubber"}
                    </SubmitButton>
                  </form>

                  <form action={deleteTemplateAction}>
                    <input type="hidden" name="templateId" value={template.id} />
                    <SubmitButton
                      pendingText="Sletter..."
                      disabled={template._count.surveyInstances > 0}
                      className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                      title={
                        template._count.surveyInstances > 0
                          ? "Kan kun slettes hvis skabelonen aldrig har været brugt"
                          : "Slet skabelon permanent"
                      }
                    >
                      Slet skabelon
                    </SubmitButton>
                  </form>

                  <p className="text-xs text-muted-foreground">
                    Ikke offentliggjort = ikke valgbar for nye klub-surveys. Sletning er kun muligt, hvis skabelonen ikke er brugt endnu.
                  </p>
                </div>
              </div>
            </details>
          ))}
          {templates.length === 0 ? <p className="text-sm text-muted-foreground">Ingen skabeloner endnu.</p> : null}
        </div>
      </section>
    </div>
  );
}
