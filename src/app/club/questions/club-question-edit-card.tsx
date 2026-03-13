"use client";

import { QuestionType } from "@prisma/client";
import { useState } from "react";

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
  active: boolean;
  options: Array<{
    id: string;
    label: string;
    sortOrder: number;
  }>;
  _count: {
    instanceQuestions: number;
  };
}

interface ClubQuestionEditCardProps {
  question: Question;
  isLocked: boolean;
  onEdit: (formData: FormData) => Promise<void>;
  onDelete: (questionId: string) => Promise<void>;
}

export function ClubQuestionEditCard({
  question,
  isLocked,
  onEdit,
  onDelete,
}: ClubQuestionEditCardProps) {
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
      alert("Kunne ikke slette spørgsmålet.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmitEdit = async (formData: FormData) => {
    await onEdit(formData);
    setIsEditing(false);
  };

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
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/80"
            >
              Gem ændringer
            </button>
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
    <article className={`rounded-lg border p-4 ${isLocked ? "bg-muted/30" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium">{question.title}</p>
            {isLocked && (
              <span className="text-xs font-semibold bg-red-100 text-red-800 px-2 py-1 rounded">
                Låst (sendt)
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Type: {questionTypeLabels[question.questionType]}
          </p>
          {question.options.length > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Svarmuligheder: {question.options.map((option) => option.label).join(", ")}
            </p>
          ) : null}
        </div>

        {!isLocked && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              Rediger
            </button>

            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {isDeleting ? "Sletter..." : "Slet"}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
