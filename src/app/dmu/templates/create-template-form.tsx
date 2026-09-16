"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/submit-button";
import type { CreateTemplateState } from "./create-template-state";

type Question = { id: string; title: string; questionType: string; benchmarkKey: string | null };
type Props = {
  action: (previous: CreateTemplateState, data: FormData) => Promise<CreateTemplateState>;
  requestId: string;
  questions: Question[];
  initialCategory: string;
};
const categoryOf = (question: Question) => question.benchmarkKey?.split("_")[0] ?? "NO_BENCHMARK";

export function CreateTemplateForm({ action, requestId, questions, initialCategory }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [surveyType, setSurveyType] = useState("ANNUAL");
  const [category, setCategory] = useState(initialCategory);
  const [selected, setSelected] = useState<string[]>([]);
  const [id, setId] = useState(requestId);
  const [state, formAction, pending] = useActionState(async (previous: CreateTemplateState, data: FormData) => {
    try {
      const result = await action(previous, data);
      if (result.status === "success") {
        setName(""); setDescription(""); setSelected([]); setId(crypto.randomUUID());
      }
      return result;
    }
    catch { return { status: "error" as const, message: "Forbindelsen blev afbrudt. Dine indtastninger er bevaret. Prøv igen — samme oprettelse bliver ikke gemt to gange." }; }
  }, { status: "idle", message: "" });
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setSlow(true), 15000);
    return () => { clearTimeout(timer); setSlow(false); };
  }, [pending]);
  useEffect(() => {
    if (state.status !== "success" || !state.templateId) return;
    router.push(`/dmu/templates?created=${encodeURIComponent(state.templateId)}`, { scroll: false });
  }, [state, router]);
  const categories = [...new Set(questions.filter(q => q.benchmarkKey).map(categoryOf))].sort((a, b) => a.localeCompare(b, "da"));

  // Dispatch explicitly so React's automatic form reset cannot clear checkboxes
  // after an error result. Native validation still runs before onSubmit.
  return <form onSubmit={event => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }} className="mt-4" aria-busy={pending}>
    <fieldset disabled={pending} className="space-y-4">
      <input type="hidden" name="requestId" value={id} />
      <div className="space-y-1">
        <label htmlFor="template-name" className="text-sm font-medium">Navn på skabelon</label>
        <input id="template-name" name="name" required minLength={3} value={name} onChange={event => setName(event.target.value)} />
      </div>
      <div className="space-y-1">
        <label htmlFor="template-description" className="text-sm font-medium">Beskrivelse</label>
        <input id="template-description" name="description" required value={description} onChange={event => setDescription(event.target.value)} />
      </div>
      <div className="space-y-1">
        <label htmlFor="template-type" className="text-sm font-medium">Type</label>
        <select id="template-type" name="surveyType" value={surveyType} onChange={event => setSurveyType(event.target.value)}>
          <option value="ANNUAL">Årlig</option><option value="EVENT">Arrangement</option>
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="template-category" className="text-sm font-medium">Vælg spørgsmål</label>
        <select id="template-category" value={category} onChange={event => setCategory(event.target.value)}>
          <option value="">Alle benchmark-kategorier</option><option value="NO_BENCHMARK">Ingen benchmark</option>
          {categories.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">{selected.length} spørgsmål valgt</p>
        {selected.map(questionId => <input key={questionId} type="hidden" name="questionIds" value={questionId} />)}
        <div className="max-h-56 space-y-2 overflow-auto rounded-md border p-3">
          {questions.filter(q => !category || categoryOf(q) === category).map(question =>
            <label key={question.id} className="grid grid-cols-[20px_1fr] items-start gap-2 rounded-md p-1.5 text-sm hover:bg-muted/30">
              <input type="checkbox" checked={selected.includes(question.id)} className="mt-0.5 h-4 w-4" onChange={event => {
                const ids = new Set(selected);
                if (event.target.checked) ids.add(question.id); else ids.delete(question.id);
                // Keep the displayed question-bank order, also across filter changes.
                setSelected(questions.filter(q => ids.has(q.id)).map(q => q.id));
              }} />
              <span className="leading-5"><span className="font-medium">{question.title}</span>
                <span className="ml-2 text-xs text-muted-foreground">({question.questionType === "SCALE_1_5" ? "Skala 1-5" : question.questionType === "SINGLE_CHOICE" ? "Valgmuligheder" : "Tekst"}{question.benchmarkKey ? ` · ${question.benchmarkKey}` : ""})</span>
              </span>
            </label>)}
          {!questions.some(q => !category || categoryOf(q) === category) && <p className="text-sm text-muted-foreground">Ingen aktive standardspørgsmål.</p>}
        </div>
      </div>
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        {pending ? <span className="flex items-center justify-center gap-2"><LoadingSpinner />Opretter skabelon...</span> : "Opret skabelon"}
      </button>
    </fieldset>
    {state.status === "error" && !pending && <p role="alert" className="mt-3 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm">{state.message}</p>}
    {state.status === "success" && !pending && <p role="status" className="mt-3 text-sm">{state.message}</p>}
    {pending && slow && <p role="status" className="mt-3 text-sm text-muted-foreground">Det tager længere tid end normalt. Afvent bekræftelsen, før du forlader siden.</p>}
  </form>;
}
