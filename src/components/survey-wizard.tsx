"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DmuLogo } from "@/components/dmu-logo";

export type WizardStep =
  | { kind: "INTRO"; title: string; description: string }
  | { kind: "HEADING"; id: string; title: string }
  | {
      kind: "QUESTION";
      id: string;
      questionId: string;
      title: string;
      description: string | null;
      questionType: "SCALE_1_5" | "TEXT" | "SINGLE_CHOICE";
      required: boolean;
      options: { value: string; label: string }[];
    };

type Props = {
  steps: WizardStep[];
  submitAction: (formData: FormData) => Promise<void>;
};

export function SurveyWizard({ steps, submitAction }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const current = steps[currentIndex];
  const isLast = currentIndex === steps.length - 1;
  const isFirst = currentIndex === 0;

  // Nummerér kun spørgsmål
  const questionNumbers: Record<string, number> = {};
  let counter = 0;
  for (const step of steps) {
    if (step.kind === "QUESTION") {
      counter++;
      questionNumbers[step.questionId] = counter;
    }
  }
  const totalQuestions = counter;

  // Fremskridt baseret på spørgsmål besvaret
  const answeredCount = Object.keys(answers).length;
  const progressPct =
    totalQuestions > 0
      ? Math.round((answeredCount / totalQuestions) * 100)
      : currentIndex === steps.length - 1
      ? 100
      : 0;

  function advance() {
    if (current.kind === "QUESTION") {
      const answer = answers[current.questionId];
      if (current.required && !answer?.trim()) {
        setError("Du skal besvare dette spørgsmål for at fortsætte.");
        return;
      }
    }
    setError(null);
    setCurrentIndex((i) => i + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setError(null);
    setCurrentIndex((i) => i - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setAnswer(questionId: string, value: string, autoAdvance = false) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setError(null);
    if (autoAdvance && !isLast) {
      setTimeout(() => {
        setCurrentIndex((i) => i + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 400);
    }
  }

  function submit() {
    if (current.kind === "QUESTION") {
      const answer = answers[current.questionId];
      if (current.required && !answer?.trim()) {
        setError("Du skal besvare dette spørgsmål for at indsende.");
        return;
      }
    }
    const formData = new FormData();
    for (const [questionId, value] of Object.entries(answers)) {
      formData.set(`question_${questionId}`, value);
    }
    startTransition(async () => {
      await submitAction(formData);
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <DmuLogo compact />
          {current.kind === "QUESTION" && (
            <span className="text-xs font-medium text-muted-foreground">
              {questionNumbers[current.questionId]} / {totalQuestions}
            </span>
          )}
        </div>
        {/* Fremskridtsbar */}
        <div className="mx-auto mt-2 max-w-lg">
          <div className="h-1 overflow-hidden rounded-full bg-muted/40">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </header>

      {/* Indhold */}
      <main className="flex flex-1 flex-col justify-center px-4 py-10">
        <div className="mx-auto w-full max-w-lg">

          {/* ── Intro ─────────────────────────────── */}
          {current.kind === "INTRO" && (
            <div className="text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-3xl mb-6">
                📋
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                {current.title}
              </h1>
              <p className="mt-4 text-base text-muted-foreground leading-relaxed max-w-sm mx-auto">
                {current.description}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Ca. {totalQuestions} spørgsmål · 2-3 minutter
              </p>
              <Link
                href="/privacy"
                className="mt-3 inline-flex text-xs font-medium text-primary underline underline-offset-2"
              >
                Sådan behandler DMU dine oplysninger
              </Link>
            </div>
          )}

          {/* ── Sektionshoved ─────────────────────── */}
          {current.kind === "HEADING" && (
            <div className="text-center py-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted/40 text-2xl mb-5">
                📌
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground mb-2">
                Nyt afsnit
              </p>
              <h2 className="text-2xl font-bold text-foreground">{current.title}</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Tryk Næste for at besvare spørgsmålene i dette afsnit.
              </p>
            </div>
          )}

          {/* ── Spørgsmål ─────────────────────────── */}
          {current.kind === "QUESTION" && (
            <div>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
                Spørgsmål {questionNumbers[current.questionId]}
              </p>
              <h2 className="text-xl font-semibold leading-snug text-foreground">
                {current.title}
                {current.required && (
                  <span className="ml-1 text-destructive" aria-label="obligatorisk">
                    *
                  </span>
                )}
              </h2>
              {current.description && (
                <p className="mt-2 text-sm text-muted-foreground">{current.description}</p>
              )}

              <div className="mt-8">

                {/* Skala 1-5 */}
                {current.questionType === "SCALE_1_5" && (
                  <div>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map((value) => {
                        const selected = answers[current.questionId] === String(value);
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setAnswer(current.questionId, String(value), true)}
                            className={[
                              "h-16 rounded-2xl border-2 text-xl font-bold transition-all active:scale-95",
                              selected
                                ? "border-primary bg-primary text-primary-foreground scale-105 shadow-lg"
                                : "border-border/70 bg-background text-foreground hover:border-primary/50 hover:bg-primary/5",
                            ].join(" ")}
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2.5 flex justify-between px-1 text-xs text-muted-foreground">
                      <span>Meget utilfreds</span>
                      <span>Meget tilfreds</span>
                    </div>
                  </div>
                )}

                {/* Enkeltvalg */}
                {current.questionType === "SINGLE_CHOICE" && (
                  <div className="space-y-3">
                    {current.options.map((option) => {
                      const selected = answers[current.questionId] === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setAnswer(current.questionId, option.value, true)}
                          className={[
                            "w-full rounded-2xl border-2 px-4 py-4 text-left text-sm font-medium transition-all active:scale-[0.98]",
                            selected
                              ? "border-primary bg-primary/8 text-foreground"
                              : "border-border/70 bg-background text-foreground hover:border-primary/40 hover:bg-muted/20",
                          ].join(" ")}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Fritekst */}
                {current.questionType === "TEXT" && (
                  <textarea
                    value={answers[current.questionId] ?? ""}
                    onChange={(e) => setAnswer(current.questionId, e.target.value)}
                    placeholder="Skriv dit svar her..."
                    rows={5}
                    className="w-full resize-none rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                )}

              </div>

              {error && (
                <p className="mt-3 text-sm font-medium text-destructive">{error}</p>
              )}
            </div>
          )}

        </div>
      </main>

      {/* Sticky footer – navigation */}
      <footer className="sticky bottom-0 border-t border-border/60 bg-background/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-lg gap-3">
          {!isFirst && (
            <button
              type="button"
              onClick={goBack}
              disabled={isPending}
              className="shrink-0 rounded-2xl border border-border/70 px-5 py-3.5 text-sm font-medium text-foreground transition hover:bg-muted/20 disabled:opacity-50"
            >
              ← Tilbage
            </button>
          )}
          {!isLast ? (
            <button
              type="button"
              onClick={advance}
              disabled={isPending}
              className="flex-1 rounded-2xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              Næste →
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="flex-1 rounded-2xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Sender..." : "Indsend svar ✓"}
            </button>
          )}
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Dine svar er anonyme og behandles fortroligt.
        </p>
      </footer>
    </div>
  );
}
