"use client";

import { useMemo, useState } from "react";

type TemplateOption = {
  id: string;
  name: string;
  description: string;
  questionCount: number;
};

type ClubOption = {
  id: string;
  name: string;
};

type EventDraft = {
  id: string;
  clubId: string;
  title: string;
  eventDate: string;
  location: string;
  eventType: string;
  sendAt: string;
};

type SendSurveyWizardProps = {
  templates: TemplateOption[];
  clubs: ClubOption[];
  createBatchAction: (formData: FormData) => Promise<void>;
};

const createDraft = (): EventDraft => ({
  id: crypto.randomUUID(),
  clubId: "",
  title: "",
  eventDate: "",
  location: "",
  eventType: "",
  sendAt: "",
});

const steps = ["Vælg skabelon", "Opret arrangementer", "Sæt sendetidspunkt", "Bekræft"];

export function SendSurveyWizard({ templates, clubs, createBatchAction }: SendSurveyWizardProps) {
  const [step, setStep] = useState(1);
  const [templateId, setTemplateId] = useState("");
  const [events, setEvents] = useState<EventDraft[]>([createDraft()]);
  const [sharedSendAt, setSharedSendAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = templates.find((template) => template.id === templateId);
  const completeEventDetails = events.every(
    (event) => event.clubId && event.title.trim() && event.eventDate && event.location.trim() && event.eventType.trim(),
  );
  const completeSendTimes = events.every((event) => event.sendAt);

  const payload = useMemo(() => {
    if (!templateId || !completeEventDetails || !completeSendTimes) {
      return "";
    }

    return JSON.stringify({
      templateId,
      events: events.map((event) => ({
        clubId: event.clubId,
        title: event.title.trim(),
        eventDate: event.eventDate,
        location: event.location.trim(),
        eventType: event.eventType.trim(),
        // datetime-local is entered in the administrator's local timezone.
        sendAt: new Date(event.sendAt).toISOString(),
      })),
    });
  }, [completeEventDetails, completeSendTimes, events, templateId]);

  function updateEvent(id: string, field: keyof Omit<EventDraft, "id">, value: string) {
    setEvents((current) => current.map((event) => (event.id === id ? { ...event, [field]: value } : event)));
  }

  function goNext() {
    if (step === 1 && !templateId) {
      setError("Vælg en aktiv event-skabelon for at fortsætte.");
      return;
    }
    if (step === 2 && !completeEventDetails) {
      setError("Udfyld klub, titel, dato, lokation og eventtype for alle arrangementer.");
      return;
    }
    if (step === 3 && !completeSendTimes) {
      setError("Angiv et sendetidspunkt for alle arrangementer.");
      return;
    }

    setError(null);
    setStep((current) => Math.min(current + 1, 4));
  }

  function applySharedSendTime() {
    if (!sharedSendAt) {
      setError("Vælg først et fælles sendetidspunkt.");
      return;
    }
    setEvents((current) => current.map((event) => ({ ...event, sendAt: sharedSendAt })));
    setError(null);
  }

  return (
    <div className="space-y-6">
      <ol className="grid gap-2 sm:grid-cols-4">
        {steps.map((label, index) => {
          const number = index + 1;
          const isCurrent = number === step;
          const isDone = number < step;
          return (
            <li key={label} className={`rounded-xl border px-4 py-3 text-sm ${isCurrent ? "border-primary bg-primary text-primary-foreground" : isDone ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "bg-muted/20 text-muted-foreground"}`}>
              <span className="font-semibold">{number}.</span> {label}
            </li>
          );
        })}
      </ol>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

      {step === 1 ? (
        <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Vælg spørgeskemaskabelon</h2>
          <p className="mt-1 text-sm text-muted-foreground">Skabelonen bruges til alle arrangementer i denne udsendelse.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {templates.map((template) => (
              <label key={template.id} className={`cursor-pointer rounded-2xl border p-5 transition ${template.id === templateId ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/30"}`}>
                <input type="radio" name="template" value={template.id} checked={template.id === templateId} onChange={() => setTemplateId(template.id)} className="sr-only" />
                <p className="font-semibold">{template.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
                <p className="mt-4 text-xs font-medium text-muted-foreground">{template.questionCount} spørgsmål</p>
              </label>
            ))}
          </div>
          {templates.length === 0 ? <p className="mt-5 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Der findes ingen aktive event-skabeloner. Opret eller aktivér en under Spørgsmål & skabeloner.</p> : null}
        </section>
      ) : null}

      {step === 2 ? (
        <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Opret arrangementer</h2>
              <p className="mt-1 text-sm text-muted-foreground">Tilføj ét eller flere arrangementer til skabelonen.</p>
            </div>
            <button type="button" onClick={() => setEvents((current) => [...current, createDraft()])} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
              + Tilføj arrangement
            </button>
          </div>

          <div className="mt-6 space-y-5">
            {events.map((event, index) => (
              <article key={event.id} className="rounded-2xl border bg-background p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="font-semibold">Arrangement {index + 1}</h3>
                  {events.length > 1 ? (
                    <button type="button" onClick={() => setEvents((current) => current.filter((item) => item.id !== event.id))} className="text-sm font-medium text-red-700 hover:underline">
                      Fjern
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <select value={event.clubId} onChange={(input) => updateEvent(event.id, "clubId", input.target.value)}>
                    <option value="">Vælg klub</option>
                    {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
                  </select>
                  <input value={event.title} onChange={(input) => updateEvent(event.id, "title", input.target.value)} placeholder="Titel på arrangement" />
                  <input value={event.eventDate} onChange={(input) => updateEvent(event.id, "eventDate", input.target.value)} type="date" />
                  <input value={event.eventType} onChange={(input) => updateEvent(event.id, "eventType", input.target.value)} placeholder="Eventtype, fx træning eller løb" />
                  <input className="md:col-span-2" value={event.location} onChange={(input) => updateEvent(event.id, "location", input.target.value)} placeholder="Lokation" />
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Sæt sendetidspunkt</h2>
          <p className="mt-1 text-sm text-muted-foreground">Vælg samme tidspunkt til alle, eller tilpas hvert arrangement enkeltvis.</p>

          <div className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border bg-muted/15 p-4">
            <label className="min-w-[260px] flex-1 text-sm font-medium">
              Fælles sendetidspunkt
              <input className="mt-1" type="datetime-local" value={sharedSendAt} onChange={(input) => setSharedSendAt(input.target.value)} />
            </label>
            <button type="button" onClick={applySharedSendTime} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
              Brug for alle
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {events.map((event, index) => (
              <div key={event.id} className="grid gap-3 rounded-2xl border bg-background p-4 md:grid-cols-[minmax(0,1fr)_280px] md:items-end">
                <div>
                  <p className="font-medium">{event.title || `Arrangement ${index + 1}`}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{clubs.find((club) => club.id === event.clubId)?.name ?? "Klub ikke valgt"} · {event.eventDate || "Dato ikke valgt"}</p>
                </div>
                <label className="text-sm font-medium">
                  Sendes
                  <input className="mt-1" type="datetime-local" value={event.sendAt} onChange={(input) => updateEvent(event.id, "sendAt", input.target.value)} />
                </label>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Bekræft og opret</h2>
          <p className="mt-1 text-sm text-muted-foreground">Når du bekræfter, oprettes arrangement, spørgeskema og planlagt udsendelse for hver række.</p>

          <div className="mt-5 rounded-2xl border bg-muted/15 p-5">
            <p className="text-sm text-muted-foreground">Skabelon</p>
            <p className="mt-1 font-semibold">{selectedTemplate?.name}</p>
          </div>
          <div className="mt-4 space-y-3">
            {events.map((event, index) => (
              <article key={event.id} className="rounded-2xl border bg-background p-5">
                <p className="font-semibold">{index + 1}. {event.title}</p>
                <div className="mt-3 grid gap-3 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                  <p><span className="block text-xs uppercase tracking-wide">Klub</span>{clubs.find((club) => club.id === event.clubId)?.name}</p>
                  <p><span className="block text-xs uppercase tracking-wide">Event</span>{event.eventDate} · {event.eventType}</p>
                  <p><span className="block text-xs uppercase tracking-wide">Lokation</span>{event.location}</p>
                  <p><span className="block text-xs uppercase tracking-wide">Sendes</span>{new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.sendAt))}</p>
                </div>
              </article>
            ))}
          </div>

          <form action={createBatchAction} className="mt-6">
            <input type="hidden" name="payload" value={payload} />
            <button type="submit" disabled={!payload} className="rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
              Opret {events.length} {events.length === 1 ? "arrangement" : "arrangementer"} og planlæg udsendelse
            </button>
          </form>
        </section>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => { setError(null); setStep((current) => Math.max(current - 1, 1)); }} disabled={step === 1} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
          Tilbage
        </button>
        {step < 4 ? <button type="button" onClick={goNext} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Fortsæt</button> : null}
      </div>
    </div>
  );
}
