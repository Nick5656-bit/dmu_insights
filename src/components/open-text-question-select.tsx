"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useTransition } from "react";
import * as Select from "@radix-ui/react-select";
import { ChevronDown, ChevronUp } from "lucide-react";

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
  const labelId = useId();
  const [isPending, startTransition] = useTransition();
  const selectedQuestion = questions.find((question) => question.id === selectedQuestionId);

  return (
    <div className="w-full min-w-0 max-w-[620px]">
      <span id={labelId} className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Spørgsmål</span>
      <Select.Root
        value={selectedQuestionId}
        disabled={isPending}
        onValueChange={(questionId) => {
          const nextParams = new URLSearchParams(searchParams.toString());
          nextParams.set("textQuestionId", questionId);
          startTransition(() => router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false }));
        }}
      >
        <Select.Trigger
          aria-labelledby={labelId}
          aria-busy={isPending}
          className="mt-1 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-background px-4 py-3 text-left text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-70"
        >
          <Select.Value placeholder="Vælg fritekstspørgsmål">
            <span className="min-w-0 whitespace-normal break-words leading-6">{selectedQuestion?.title}</span>
          </Select.Value>
          <Select.Icon asChild><ChevronDown aria-hidden="true" className="size-4 shrink-0" /></Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            align="start"
            sideOffset={6}
            collisionPadding={16}
            className="z-50 max-h-[var(--radix-select-content-available-height)] w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-lg"
          >
            <Select.ScrollUpButton className="flex justify-center py-1"><ChevronUp aria-hidden="true" className="size-4" /></Select.ScrollUpButton>
            <Select.Viewport className="p-1">
              {questions.map((question) => (
                <Select.Item
                  key={question.id}
                  value={question.id}
                  textValue={question.title}
                  className="cursor-pointer rounded-lg px-3 py-3 text-sm outline-none data-[highlighted]:bg-muted data-[state=checked]:bg-muted/60 data-[state=checked]:font-medium"
                >
                  <Select.ItemText><span className="block whitespace-normal break-words leading-6">{question.title}</span></Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
            <Select.ScrollDownButton className="flex justify-center py-1"><ChevronDown aria-hidden="true" className="size-4" /></Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
