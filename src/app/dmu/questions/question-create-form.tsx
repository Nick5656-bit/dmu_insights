"use client";

import { QuestionType } from "@prisma/client";
import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";

type Props = {
  action: (formData: FormData) => Promise<void>;
  benchmarkCategoryOptions: string[];
};

const questionTypeDetails: Record<QuestionType, { title: string; description: string }> = {
  SCALE_1_5: {
    title: "Skala 1–5",
    description: "Gemmes som en score og kan bruges til benchmark, gennemsnit og grafer.",
  },
  SINGLE_CHOICE: {
    title: "Valgmuligheder",
    description: "Svarene vises som en fordeling. De omdannes ikke til en score eller et gennemsnit.",
  },
  TEXT: {
    title: "Fritekst",
    description: "Deltageren skriver sit eget svar. Svar vises først, når anonymitetsgrænsen er nået.",
  },
};

export function QuestionCreateForm({ action, benchmarkCategoryOptions }: Props) {
  const [questionType, setQuestionType] = useState<QuestionType>("SCALE_1_5");
  const [options, setOptions] = useState([""]);
  const hasEnoughOptions = options.filter((option) => option.trim().length > 0).length >= 2;

  const updateOption = (index: number, value: string) => {
    setOptions((current) => current.map((option, optionIndex) => (optionIndex === index ? value : option)));
  };

  const removeOption = (index: number) => {
    setOptions((current) => (current.length > 1 ? current.filter((_, optionIndex) => optionIndex !== index) : current));
  };

  return (
    <form action={action} className="mt-5 space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="title">
            Spørgsmålstekst
          </label>
          <input
            id="title"
            name="title"
            required
            className="h-11 w-full rounded-xl border border-border/70 bg-background px-3 text-sm"
            placeholder="Fx Hvor tilfreds er du samlet set med klubben?"
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="description">
            Hjælpetekst <span className="font-normal text-muted-foreground">(valgfri)</span>
          </label>
          <input
            id="description"
            name="description"
            className="h-11 w-full rounded-xl border border-border/70 bg-background px-3 text-sm"
            placeholder="Fx Tænk på de seneste seks måneder."
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="questionType">
            Svartype
          </label>
          <select
            id="questionType"
            name="questionType"
            value={questionType}
            onChange={(event) => setQuestionType(event.target.value as QuestionType)}
            className="h-11 w-full rounded-xl border border-border/70 bg-background px-3 text-sm"
          >
            <option value="SCALE_1_5">Skala 1–5</option>
            <option value="SINGLE_CHOICE">Valgmuligheder</option>
            <option value="TEXT">Fritekst</option>
          </select>
        </div>
      </div>

      <section className="rounded-[22px] border border-border/70 bg-muted/15 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Svarformat</p>
        <h3 className="mt-2 font-heading text-lg font-semibold text-foreground">{questionTypeDetails[questionType].title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{questionTypeDetails[questionType].description}</p>

        {questionType === "SCALE_1_5" ? (
          <div className="mt-5 grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <div key={value} className="rounded-xl border border-border/70 bg-background px-3 py-3 text-center">
                <span className="font-heading text-lg font-semibold text-foreground">{value}</span>
              </div>
            ))}
          </div>
        ) : null}

        {questionType === "SINGLE_CHOICE" ? (
          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">Svarmuligheder</p>
              <p className="text-xs text-muted-foreground">Mindst to svarmuligheder kræves.</p>
            </div>

            <div className="space-y-2">
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    name="optionLabel"
                    value={option}
                    onChange={(event) => updateOption(index, event.target.value)}
                    required={index === 0}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-border/70 bg-background px-3 text-sm"
                    placeholder={`Svarmulighed ${index + 1}`}
                    aria-label={`Svarmulighed ${index + 1}`}
                  />
                  {options.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeOption(index)}
                      className="h-11 rounded-xl border border-border/70 px-3 text-sm font-medium text-muted-foreground transition hover:bg-background hover:text-foreground"
                      aria-label={`Fjern svarmulighed ${index + 1}`}
                    >
                      Fjern
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setOptions((current) => [...current, ""])}
              className="rounded-xl border border-border/70 bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              Tilføj svarmulighed
            </button>
          </div>
        ) : null}

        {questionType === "TEXT" ? (
          <div className="mt-5 rounded-xl border border-dashed border-border/70 bg-background/70 px-4 py-4 text-sm text-muted-foreground">
            Deltageren får et tekstfelt til sit svar. Der skal ikke oprettes svarmuligheder.
          </div>
        ) : null}
      </section>

      {questionType === "SCALE_1_5" ? (
        <section className="rounded-[22px] border border-border/70 bg-card p-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Analyse og benchmark</p>
            <p className="mt-1 text-sm text-muted-foreground">Valgfrit. Bruges til at gruppere og sammenligne skala-spørgsmål på dashboardet.</p>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="benchmarkCategory">
                Benchmark-kategori
              </label>
              <select id="benchmarkCategory" name="benchmarkCategory" defaultValue="" className="h-11 w-full rounded-xl border border-border/70 bg-background px-3 text-sm">
                <option value="">Ingen benchmark</option>
                {benchmarkCategoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="benchmarkCategoryCustom">
                Ny kategori <span className="font-normal text-muted-foreground">(valgfri)</span>
              </label>
              <input
                id="benchmarkCategoryCustom"
                name="benchmarkCategoryCustom"
                className="h-11 w-full rounded-xl border border-border/70 bg-background px-3 text-sm"
                placeholder="Fx Sikkerhed"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium" htmlFor="benchmarkCode">
                Benchmark-kode <span className="font-normal text-muted-foreground">(valgfri)</span>
              </label>
              <input
                id="benchmarkCode"
                name="benchmarkCode"
                className="h-11 w-full rounded-xl border border-border/70 bg-background px-3 text-sm"
                placeholder="Fx OVERALL eller ACTIVITY_VALUE"
              />
            </div>
          </div>
        </section>
      ) : null}

      <div>
        <SubmitButton
          pendingText="Opretter..."
          disabled={questionType === "SINGLE_CHOICE" && !hasEnoughOptions}
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Opret spørgsmål
        </SubmitButton>
      </div>
    </form>
  );
}
