import { QuestionType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { QuestionEditCard } from "./question-edit-card";
import { QuestionCreateForm } from "./question-create-form";

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

function buildBenchmarkKey(categoryRaw: string, codeRaw: string, fallbackTitle: string): string | null {
  const category = normalizeKeyPart(categoryRaw);
  if (!category) {
    return null;
  }

  const code = normalizeKeyPart(codeRaw || fallbackTitle) || "ITEM";
  return `${category}_${code}`;
}

function extractHeadingCategories(layoutJson: unknown): string[] {
  if (!layoutJson || typeof layoutJson !== "object") {
    return [];
  }

  const items = (layoutJson as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return [];
  }

  const categories: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (record.kind !== "HEADING" || typeof record.title !== "string") {
      continue;
    }

    const normalized = normalizeKeyPart(record.title);
    if (normalized) {
      categories.push(normalized);
    }
  }

  return categories;
}

const createQuestionSchema = z.object({
  title: z.string().trim().min(3),
  description: z.string().trim().optional(),
  questionType: z.nativeEnum(QuestionType),
  benchmarkCategory: z.string().trim().optional(),
  benchmarkCategoryCustom: z.string().trim().optional(),
  benchmarkCode: z.string().trim().optional(),
  optionsRaw: z.string().trim().optional(),
});

const editQuestionSchema = z.object({
  questionId: z.string(),
  title: z.string().trim().min(3),
  description: z.string().trim().optional(),
  questionType: z.nativeEnum(QuestionType),
  benchmarkCategory: z.string().trim().optional(),
  benchmarkCategoryCustom: z.string().trim().optional(),
  benchmarkCode: z.string().trim().optional(),
  optionsRaw: z.string().trim().optional(),
});

function resolveBenchmarkCategory(selected: string | undefined, custom: string | undefined): string {
  const customValue = (custom ?? "").trim();
  if (customValue) {
    return customValue;
  }

  if (!selected || selected === "") {
    return "";
  }

  return selected;
}

function resolveOptionLabels(formData: FormData, fallbackRaw: string | undefined): string[] {
  const dynamicOptions = formData
    .getAll("optionLabel")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (dynamicOptions.length > 0) {
    return dynamicOptions;
  }

  return (fallbackRaw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

type DmuQuestionsPageProps = {
  searchParams: Promise<{
    benchmarkCategory?: string;
    sort?: string;
  }>;
};

export default async function DmuQuestionsPage({ searchParams }: DmuQuestionsPageProps) {
  await requireRole("DMU_ADMIN");
  const params = await searchParams;

  const selectedCategoryFilter =
    params.benchmarkCategory === "NO_BENCHMARK"
      ? "NO_BENCHMARK"
      : normalizeKeyPart(params.benchmarkCategory ?? "") || "";
  const selectedSort =
    params.sort === "oldest" ||
    params.sort === "benchmark_asc" ||
    params.sort === "benchmark_desc"
      ? params.sort
      : "newest";

  const [questions, allQuestionBenchmarkKeys, templates] = await Promise.all([
    prisma.question.findMany({
      where: {
        scope: "DMU_STANDARD",
        ...(selectedCategoryFilter === "NO_BENCHMARK"
          ? { benchmarkKey: null }
          : selectedCategoryFilter
            ? { benchmarkKey: { startsWith: `${selectedCategoryFilter}_` } }
            : {}),
      },
      include: { options: { orderBy: { sortOrder: "asc" } } },
      orderBy:
        selectedSort === "oldest"
          ? [{ createdAt: "asc" }]
          : selectedSort === "benchmark_asc"
            ? [{ benchmarkKey: "asc" }, { createdAt: "desc" }]
            : selectedSort === "benchmark_desc"
              ? [{ benchmarkKey: "desc" }, { createdAt: "desc" }]
              : [{ createdAt: "desc" }],
    }),
    prisma.question.findMany({
      where: { scope: "DMU_STANDARD", benchmarkKey: { not: null } },
      select: { benchmarkKey: true },
    }),
    prisma.surveyTemplate.findMany({
      select: { layoutJson: true },
    }),
  ]);

  const benchmarkCategoryOptions = [...new Set([
    ...allQuestionBenchmarkKeys
      .map((question) => (question.benchmarkKey ? normalizeKeyPart(question.benchmarkKey.split("_")[0] ?? "") : ""))
      .filter(Boolean),
    ...templates.flatMap((template) => extractHeadingCategories(template.layoutJson)),
  ])].sort((a, b) => a.localeCompare(b, "da"));

  async function createQuestionAction(formData: FormData) {
    "use server";
    await requireRole("DMU_ADMIN");

    const parsed = createQuestionSchema.safeParse({
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      questionType: String(formData.get("questionType") ?? "") as QuestionType,
      benchmarkCategory: String(formData.get("benchmarkCategory") ?? ""),
      benchmarkCategoryCustom: String(formData.get("benchmarkCategoryCustom") ?? ""),
      benchmarkCode: String(formData.get("benchmarkCode") ?? ""),
      optionsRaw: String(formData.get("optionsRaw") ?? ""),
    });

    if (!parsed.success) {
      return;
    }

    const data = parsed.data;
    const resolvedBenchmarkCategory = resolveBenchmarkCategory(data.benchmarkCategory, data.benchmarkCategoryCustom);
    const options =
      data.questionType === "SINGLE_CHOICE"
        ? resolveOptionLabels(formData, data.optionsRaw)
        : [];

    if (data.questionType === "SINGLE_CHOICE" && options.length < 2) {
      return;
    }

    const createdQuestion = await prisma.question.create({
      data: {
        title: data.title,
        description: data.description || null,
        questionType: data.questionType,
        scope: "DMU_STANDARD",
        benchmarkKey:
          data.questionType === "SCALE_1_5"
            ? buildBenchmarkKey(resolvedBenchmarkCategory, data.benchmarkCode ?? "", data.title)
            : null,
        active: true,
      },
    });

    if (options.length > 0) {
      await prisma.questionOption.createMany({
        data: options.map((label, index) => ({
          questionId: createdQuestion.id,
          label,
          value: label.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, ""),
          sortOrder: index + 1,
        })),
      });
    }

    revalidatePath("/dmu/questions");
  }

  async function toggleQuestionActiveAction(formData: FormData) {
    "use server";
    await requireRole("DMU_ADMIN");

    const questionId = String(formData.get("questionId") ?? "");
    const nextActive = String(formData.get("nextActive") ?? "") === "true";
    if (!questionId) {
      return;
    }

    await prisma.question.update({
      where: { id: questionId },
      data: { active: nextActive },
    });

    revalidatePath("/dmu/questions");
  }

  async function editQuestionAction(formData: FormData) {
    "use server";
    await requireRole("DMU_ADMIN");

    const parsed = editQuestionSchema.safeParse({
      questionId: String(formData.get("questionId") ?? ""),
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      questionType: String(formData.get("questionType") ?? "") as QuestionType,
      benchmarkCategory: String(formData.get("benchmarkCategory") ?? ""),
      benchmarkCategoryCustom: String(formData.get("benchmarkCategoryCustom") ?? ""),
      benchmarkCode: String(formData.get("benchmarkCode") ?? ""),
      optionsRaw: String(formData.get("optionsRaw") ?? ""),
    });

    if (!parsed.success) {
      return;
    }

    const data = parsed.data;
    const resolvedBenchmarkCategory = resolveBenchmarkCategory(data.benchmarkCategory, data.benchmarkCategoryCustom);
    const options =
      data.questionType === "SINGLE_CHOICE"
        ? (data.optionsRaw ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];

    if (data.questionType === "SINGLE_CHOICE" && options.length < 2) {
      return;
    }

    // Update question
    await prisma.question.update({
      where: { id: data.questionId },
      data: {
        title: data.title,
        description: data.description || null,
        questionType: data.questionType,
        benchmarkKey: buildBenchmarkKey(resolvedBenchmarkCategory, data.benchmarkCode ?? "", data.title),
      },
    });

    // Delete and recreate options
    await prisma.questionOption.deleteMany({
      where: { questionId: data.questionId },
    });

    if (options.length > 0) {
      await prisma.questionOption.createMany({
        data: options.map((label, index) => ({
          questionId: data.questionId,
          label,
          value: label.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, ""),
          sortOrder: index + 1,
        })),
      });
    }

    revalidatePath("/dmu/questions");
  }

  async function deleteQuestionAction(questionId: string) {
    "use server";
    await requireRole("DMU_ADMIN");

    if (!questionId) {
      throw new Error("Question ID is required");
    }

    // Check if question is used in templates
    const usageCount = await prisma.surveyTemplateQuestion.count({
      where: { questionId },
    });

    // Also check if it's used in any survey instances
    const instanceUsageCount = await prisma.surveyInstanceQuestion.count({
      where: { questionId },
    });

    if (usageCount > 0 || instanceUsageCount > 0) {
      throw new Error("Spørgsmålet bruges allerede i skabeloner eller surveys. Fjern det fra disse først.");
    }

    // Delete options first (due to FK constraint)
    await prisma.questionOption.deleteMany({
      where: { questionId },
    });

    // Delete question
    await prisma.question.delete({
      where: { id: questionId },
    });

    revalidatePath("/dmu/questions");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_30%),linear-gradient(145deg,rgba(16,36,77,0.98),rgba(36,67,126,0.94))] p-6 text-primary-foreground shadow-[0_32px_60px_-42px_rgba(21,37,77,0.65)] [&_p.text-muted-foreground]:text-white/75">
        <div>
          <div className="text-white/75 [&_h1]:text-white [&_p]:text-white/75">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Spørgsmål & skabeloner</p>
            <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-foreground">Standardspørgsmål</h1>
            <p className="mt-2 text-sm text-muted-foreground">Biblioteket bag skabelonerne.</p>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Nyt spørgsmål</h2>
        <QuestionCreateForm action={createQuestionAction} benchmarkCategoryOptions={benchmarkCategoryOptions} />
      </section>

      <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Spørgsmål</h2>
            <p className="mt-1 text-sm text-muted-foreground">{questions.length} fundet</p>
          </div>
        </div>

        <form method="get" className="mt-4 grid gap-3 md:grid-cols-3">
          <select name="benchmarkCategory" defaultValue={selectedCategoryFilter} className="h-10 rounded-md border px-3 text-sm">
            <option value="">Alle benchmark-kategorier</option>
            <option value="NO_BENCHMARK">Ingen benchmark</option>
            {benchmarkCategoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <select name="sort" defaultValue={selectedSort} className="h-10 rounded-md border px-3 text-sm">
            <option value="newest">Nyeste først</option>
            <option value="oldest">Ældste først</option>
            <option value="benchmark_asc">Benchmark-kategori A-Å</option>
            <option value="benchmark_desc">Benchmark-kategori Å-A</option>
          </select>

          <div className="flex gap-3">
            <button type="submit" className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
              Anvend
            </button>
            {(selectedCategoryFilter || selectedSort !== "newest") && (
              <a href="/dmu/questions" className="flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted">
                Nulstil
              </a>
            )}
          </div>
        </form>

        <div className="mt-4 space-y-3">
          {questions.map((question) => (
            <QuestionEditCard
              key={question.id}
              question={question}
              benchmarkCategoryOptions={benchmarkCategoryOptions}
              onEdit={editQuestionAction}
              onDelete={deleteQuestionAction}
              onToggleActive={toggleQuestionActiveAction}
            />
          ))}
          {questions.length === 0 ? <p className="text-sm text-muted-foreground">Ingen standardspørgsmål fundet for de valgte filtre.</p> : null}
        </div>
      </section>
    </div>
  );
}
