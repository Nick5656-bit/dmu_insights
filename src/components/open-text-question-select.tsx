"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type TextQuestionOption = {
  id: string;
  title: string;
};

type OpenTextQuestionSelectProps = {
  questions: TextQuestionOption[];
  selectedQuestionId: string;
};

export function OpenTextQuestionSelect({ questions, selectedQuestionId }: OpenTextQuestionSelectProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <label className="block min-w-0 sm:w-[360px]">
      <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Spørgsmål</span>
      <select
        value={selectedQuestionId}
        onChange={(event) => {
          const nextParams = new URLSearchParams(searchParams.toString());
          nextParams.set("textQuestionId", event.target.value);
          router.replace(`${pathname}?${nextParams.toString()}`);
        }}
        className="mt-1 h-11 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground"
        aria-label="Vælg fritekstspørgsmål"
      >
        {questions.map((question) => (
          <option key={question.id} value={question.id}>
            {question.title}
          </option>
        ))}
      </select>
    </label>
  );
}
