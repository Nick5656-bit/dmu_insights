"use client";

import { QuestionType } from "@prisma/client";
import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";

type Props = {
  action: (formData: FormData) => Promise<void>;
};

export function ClubQuestionCreateForm({ action }: Props) {
  const [questionType, setQuestionType] = useState<QuestionType>("SCALE_1_5");

  return (
    <form action={action} className="mt-4 grid gap-4 md:grid-cols-2">
      <div className="space-y-1 md:col-span-2">
        <label className="text-sm font-medium" htmlFor="title">
          Spørgsmålstekst
        </label>
        <input id="title" name="title" required className="w-full rounded-md border px-3 py-2 text-sm" />
      </div>

      <div className="space-y-1 md:col-span-2">
        <label className="text-sm font-medium" htmlFor="description">
          Beskrivelse (valgfri)
        </label>
        <input id="description" name="description" className="w-full rounded-md border px-3 py-2 text-sm" />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="questionType">
          Type
        </label>
        <select
          id="questionType"
          name="questionType"
          value={questionType}
          onChange={(event) => setQuestionType(event.target.value as QuestionType)}
          className="w-full rounded-md border px-3 py-2 text-sm"
        >
          <option value="SCALE_1_5">Skala 1-5</option>
          <option value="SINGLE_CHOICE">Valgmuligheder</option>
          <option value="TEXT">Tekst</option>
        </select>
      </div>

      {questionType === "SINGLE_CHOICE" ? (
        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="optionsRaw">
            Svarmuligheder (kommasepareret)
          </label>
          <input
            id="optionsRaw"
            name="optionsRaw"
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Meget positivt, Positivt, Neutralt"
          />
        </div>
      ) : null}

      <div className="md:col-span-2">
        <SubmitButton pendingText="Opretter..." className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Opret spørgsmål
        </SubmitButton>
      </div>
    </form>
  );
}
