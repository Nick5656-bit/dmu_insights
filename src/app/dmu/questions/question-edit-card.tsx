"use client";

import { QuestionType } from "@prisma/client";
import { useState } from "react";
import { LoadingSpinner, SubmitButton } from "@/components/submit-button";

const questionTypeLabels: Record<QuestionType, string> = {
  SCALE_1_5: "Skala 1-5",
  SINGLE_CHOICE: "Valgmuligheder",
  TEXT: "Tekst",
};

interface Question {
  id: string;
  title: string;
  description: string | null;
  questionType: QuestionType;
  benchmarkKey: string | null;
  active: boolean;
  options: Array<{
    id: string;
    label: string;
    sortOrder: number;
  }>;
}

interface QuestionEditCardProps {
  question: Question;
  benchmarkCategoryOptions: string[];
  onEdit: (formData: FormData) => Promise<void>;
  onDelete: (questionId: string) => Promise<void>;
  onToggleActive: (formData: FormData) => Promise<void>;
}

export function QuestionEditCard({
  question,
  benchmarkCategoryOptions,
  onEdit,
  onDelete,
  onToggleActive,
}: QuestionEditCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(`Er du sikker på, at du vil slette "${question.title}"?`)) {
      return;
    }
    setIsDeleting(true);
    try {
      await onDelete(question.id);
    } catch (error) {
      console.error("Delete failed:", error);
      alert("Kunne ikke slette spørgsmålet. Det er muligvis brugt i en skabelon.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmitEdit = async (formData: FormData) => {
    await onEdit(formData);
    setIsEditing(false);
  };

  const currentBenchmarkCategory = question.benchmarkKey ? (question.benchmarkKey.split("_")[0] ?? "") : "";
  const currentBenchmarkCode = question.benchmarkKey
    ? question.benchmarkKey.split("_").slice(1).join("_")
    : "";

  if (isEditing) {
    return (
      <article className="rounded-lg border p-4 bg-muted/30">
        <form action={handleSubmitEdit} className="space-y-4">
          <input type="hidden" name="questionId" value={question.id} />

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor={`title-${question.id}`}>
              Spørgsmålstekst
            </label>
            <input
              id={`title-${question.id}`}
              name="title"
              defaultValue={question.title}
              required
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor={`description-${question.id}`}>
              Beskrivelse (valgfri)
            </label>
            <input
              id={`description-${question.id}`}
              name="description"
              defaultValue={question.description ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor={`questionType-${question.id}`}>
              Type
            </label>
            <select
              id={`questionType-${question.id}`}
              name="questionType"
              defaultValue={question.questionType}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="SCALE_1_5">Skala 1-5</option>
              <option value="SINGLE_CHOICE">Valgmuligheder</option>
              <option value="TEXT">Tekst</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor={`benchmarkCategory-${question.id}`}>
              Benchmark-kategori (valgfri)
            </label>
            <select
              id={`benchmarkCategory-${question.id}`}
              name="benchmarkCategory"
              defaultValue={currentBenchmarkCategory}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Ingen benchmark</option>
              {benchmarkCategoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <input
              name="benchmarkCategoryCustom"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Ny kategori (valgfri)"
            />
            <p className="text-xs text-muted-foreground">Overskriver valgt kategori.</p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor={`benchmarkCode-${question.id}`}>
              Benchmark-kode (valgfri)
            </label>
            <input
              id={`benchmarkCode-${question.id}`}
              name="benchmarkCode"
              defaultValue={currentBenchmarkCode}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="fx OVERALL eller ACTIVITY_VALUE"
            />
          </div>

          {question.questionType === "SINGLE_CHOICE" && (
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor={`optionsRaw-${question.id}`}>
                Svarmuligheder (kommasepareret)
              </label>
              <input
                id={`optionsRaw-${question.id}`}
                name="optionsRaw"
                defaultValue={question.options.map((opt) => opt.label).join(", ")}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Meget positivt, Positivt, Neutralt"
              />
            </div>
          )}

          <div className="flex gap-2">
            <SubmitButton
              pendingText="Gemmer..."
              className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/80"
            >
              Gem ændringer
            </SubmitButton>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-md border px-4 py-2 text-xs font-medium hover:bg-muted"
            >
              Annuller
            </button>
          </div>
        </form>
      </article>
    );
  }

  return (
    <article className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium break-words">{question.title}</p>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {questionTypeLabels[question.questionType]} · {question.benchmarkKey ?? "Ingen benchmark"}
          </p>
          {question.options.length > 0 ? (
            <p className="mt-1 break-words text-xs text-muted-foreground">
              {question.options.map((option) => option.label).join(", ")}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted"
          >
            Rediger
          </button>

          <form action={onToggleActive}>
            <input type="hidden" name="questionId" value={question.id} />
            <input type="hidden" name="nextActive" value={question.active ? "false" : "true"} />
            <SubmitButton
              pendingText="Opdaterer..."
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                question.active
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  : "border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100"
              }`}
              aria-label={question.active ? "Sæt som deaktiveret" : "Sæt som aktiv"}
            >
              <span
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  question.active ? "bg-emerald-500" : "bg-gray-400"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    question.active ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </span>
              <span>{question.active ? "Aktiveret" : "Deaktiveret"}</span>
            </SubmitButton>
          </form>

          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {isDeleting ? <span className="inline-flex items-center gap-2"><LoadingSpinner />Sletter...</span> : "Slet"}
          </button>
        </div>
      </div>
    </article>
  );
}
