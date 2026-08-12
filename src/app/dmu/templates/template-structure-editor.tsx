"use client";

import { useMemo, useState } from "react";

type QuestionMeta = {
  id: string;
  title: string;
  questionType: "SCALE_1_5" | "SINGLE_CHOICE" | "TEXT";
  benchmarkKey: string | null;
};

type StructureHeading = {
  id: string;
  kind: "HEADING";
  title: string;
};

type StructureQuestion = {
  id: string;
  kind: "QUESTION";
  questionId: string;
  required: boolean;
  isCore: boolean;
};

type StructureItem = StructureHeading | StructureQuestion;

type Props = {
  templateId: string;
  initialItems: StructureItem[];
  questionPool: QuestionMeta[];
  questionMeta: QuestionMeta[];
  saveAction: (formData: FormData) => Promise<void>;
};

function moveItem(items: StructureItem[], fromId: string, toId: string): StructureItem[] {
  const fromIndex = items.findIndex((item) => item.id === fromId);
  const toIndex = items.findIndex((item) => item.id === toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function getQuestionTypeLabel(questionType: QuestionMeta["questionType"]): string {
  if (questionType === "SCALE_1_5") {
    return "Skala 1-5";
  }
  if (questionType === "SINGLE_CHOICE") {
    return "Valgmuligheder";
  }
  return "Tekst";
}

export function TemplateStructureEditor({ templateId, initialItems, questionPool, questionMeta, saveAction }: Props) {
  const [items, setItems] = useState<StructureItem[]>(initialItems);
  const [headingTitle, setHeadingTitle] = useState("");
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  const questionById = useMemo(() => {
    const merged = [...questionPool, ...questionMeta];
    return new Map(merged.map((question) => [question.id, question]));
  }, [questionMeta, questionPool]);

  const usedQuestionIds = useMemo(
    () => new Set(items.filter((item): item is StructureQuestion => item.kind === "QUESTION").map((item) => item.questionId)),
    [items],
  );

  const addableQuestions = questionPool.filter((question) => !usedQuestionIds.has(question.id));

  function addHeading() {
    const title = headingTitle.trim();
    if (!title) {
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        id: `heading-${crypto.randomUUID()}`,
        kind: "HEADING",
        title,
      },
    ]);
    setHeadingTitle("");
  }

  function addQuestion() {
    const questionId = selectedQuestionId.trim();
    if (!questionId || usedQuestionIds.has(questionId)) {
      return;
    }

    const question = questionById.get(questionId);
    setItems((prev) => [
      ...prev,
      {
        id: `question-${questionId}`,
        kind: "QUESTION",
        questionId,
        required: true,
        isCore: Boolean(question?.benchmarkKey),
      },
    ]);
    setSelectedQuestionId("");
  }

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`heading-title-${templateId}`}>
            Nyt afsnit
          </label>
          <input
            id={`heading-title-${templateId}`}
            value={headingTitle}
            onChange={(event) => setHeadingTitle(event.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="fx Sikkerhed"
          />
        </div>
        <button type="button" onClick={addHeading} className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted">
          Tilføj afsnit
        </button>

        <div className="flex-1 min-w-[220px]">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`add-question-${templateId}`}>
            Tilføj spørgsmål
          </label>
          <select
            id={`add-question-${templateId}`}
            value={selectedQuestionId}
            onChange={(event) => setSelectedQuestionId(event.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">Vælg spørgsmål</option>
            {addableQuestions.map((question) => (
              <option key={question.id} value={question.id}>
                {question.title}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={addQuestion} className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted">
          Tilføj spørgsmål
        </button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">Træk for at ændre rækkefølge.</p>

      <div className="mt-3 space-y-2">
        {items.map((item) => {
          if (item.kind === "HEADING") {
            return (
              <div
                key={item.id}
                draggable
                onDragStart={() => setDraggedItemId(item.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (!draggedItemId) {
                    return;
                  }
                  setItems((prev) => moveItem(prev, draggedItemId, item.id));
                  setDraggedItemId(null);
                }}
                className="rounded-md border border-blue-200 bg-blue-50 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-blue-900">{item.title}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const nextTitle = window.prompt("Rediger afsnitsoverskrift", item.title);
                        if (!nextTitle || !nextTitle.trim()) {
                          return;
                        }
                        setItems((prev) =>
                          prev.map((current) =>
                            current.id === item.id && current.kind === "HEADING"
                              ? { ...current, title: nextTitle.trim() }
                              : current,
                          ),
                        );
                      }}
                      className="rounded-md border border-blue-300 px-2 py-1 text-xs font-medium text-blue-900 hover:bg-blue-100"
                    >
                      Rediger
                    </button>
                    <button
                      type="button"
                      onClick={() => setItems((prev) => prev.filter((current) => current.id !== item.id))}
                      className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                    >
                      Fjern
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          const question = questionById.get(item.questionId);
          if (!question) {
            return null;
          }

          return (
            <div
              key={item.id}
              draggable
              onDragStart={() => setDraggedItemId(item.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (!draggedItemId) {
                  return;
                }
                setItems((prev) => moveItem(prev, draggedItemId, item.id));
                setDraggedItemId(null);
              }}
              className="rounded-md border p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{question.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {getQuestionTypeLabel(question.questionType)}
                    {question.benchmarkKey ? ` · ${question.benchmarkKey}` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={item.required}
                      onChange={(event) =>
                        setItems((prev) =>
                          prev.map((current) =>
                            current.id === item.id && current.kind === "QUESTION"
                              ? { ...current, required: event.target.checked }
                              : current,
                          ),
                        )
                      }
                    />
                    Påkrævet
                  </label>

                  <label className="inline-flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      disabled={!question.benchmarkKey}
                      checked={item.isCore && Boolean(question.benchmarkKey)}
                      onChange={(event) =>
                        setItems((prev) =>
                          prev.map((current) =>
                            current.id === item.id && current.kind === "QUESTION"
                              ? { ...current, isCore: event.target.checked }
                              : current,
                          ),
                        )
                      }
                    />
                    Benchmark
                  </label>

                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((current) => current.id !== item.id))}
                    className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    Fjern
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {items.length === 0 ? <p className="text-sm text-muted-foreground">Skabelonen er tom.</p> : null}
      </div>

      <form action={saveAction} className="mt-4">
        <input type="hidden" name="templateId" value={templateId} />
        <input type="hidden" name="structureJson" value={JSON.stringify({ version: 1, items })} />
        <button type="submit" className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
          Gem spørgsmål og afsnit
        </button>
      </form>
    </div>
  );
}
