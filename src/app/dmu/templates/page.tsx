import { SurveyType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createTemplateSchema = z.object({
  name: z.string().trim().min(3),
  description: z.string().trim().min(5),
  surveyType: z.nativeEnum(SurveyType),
  questionIds: z.array(z.string().min(1)).min(1),
});

const surveyTypeLabels: Record<SurveyType, string> = {
  ANNUAL: "Årlig",
  EVENT: "Arrangement",
};

export default async function DmuTemplatesPage() {
  await requireRole("DMU_ADMIN");

  const [questions, templates] = await Promise.all([
    prisma.question.findMany({
      where: {
        scope: "DMU_STANDARD",
        active: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.surveyTemplate.findMany({
      include: {
        templateQuestions: {
          include: { question: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

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

    if (selectedQuestions.length === 0) {
      return;
    }

    const template = await prisma.surveyTemplate.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        surveyType: parsed.data.surveyType,
        isActive: true,
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

    await prisma.surveyTemplateQuestion.createMany({ data: createRows });

    revalidatePath("/dmu/templates");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-background p-6">
        <h2 className="text-xl font-semibold">Spørgeskema-skabeloner</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Opret centrale skabeloner til årlige målinger og arrangementer med aktive DMU-standardspørgsmål.
        </p>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Opret ny skabelon</h3>
        <form action={createTemplateAction} className="mt-4 grid gap-4 md:grid-cols-2">
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

          <div className="space-y-2 md:col-span-2">
            <p className="text-sm font-medium">Vælg standardspørgsmål</p>
            <div className="max-h-56 space-y-2 overflow-auto rounded-md border p-3">
              {questions.map((question) => (
                <label key={question.id} className="grid grid-cols-[20px_1fr] items-start gap-2 rounded-md p-1.5 text-sm hover:bg-muted/30">
                  <input type="checkbox" name="questionIds" value={question.id} className="mt-0.5 h-4 w-4" />
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
          </div>

          <div className="md:col-span-2">
            <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Opret skabelon
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Eksisterende skabeloner</h3>
        <div className="mt-4 space-y-3">
          {templates.map((template) => (
            <article key={template.id} className="rounded-lg border p-4">
              <p className="font-medium">{template.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Type: {surveyTypeLabels[template.surveyType]} · {template.templateQuestions.length} spørgsmål
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{template.description}</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {template.templateQuestions.map((templateQuestion) => (
                  <li key={templateQuestion.id}>
                    {templateQuestion.question.title}
                    {templateQuestion.isCoreBenchmarkQuestion ? " (sammenligningsspørgsmål)" : ""}
                  </li>
                ))}
              </ul>
            </article>
          ))}
          {templates.length === 0 ? <p className="text-sm text-muted-foreground">Ingen skabeloner endnu.</p> : null}
        </div>
      </section>
    </div>
  );
}
