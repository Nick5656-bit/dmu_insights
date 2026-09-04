"use client";

import { useMemo, useState } from "react";

type SurveyType = "ANNUAL" | "EVENT";

type TemplateOption = {
  id: string;
  name: string;
  description: string;
  questionCount: number;
  surveyType: SurveyType;
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
  closesAt: string;
};

type SendSurveyWizardProps = {
  templates: TemplateOption[];
  clubs: ClubOption[];
  createBatchAction: (formData: FormData) => Promise<void>;
};

const createEventDraft = (): EventDraft => ({
  id: crypto.randomUUID(),
  clubId: "",
  title: "",
  eventDate: "",
  location: "",
  eventType: "",
  sendAt: "",
  closesAt: "",
});

const typeLabels: Record<SurveyType, string> = {
  ANNUAL: "Årlig måling",
  EVENT: "Arrangement",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function SendSurveyWizard({ templates, clubs, createBatchAction }: SendSurveyWizardProps) {
  const [step, setStep] = useState(1);
  const [templateId, setTemplateId] = useState("");
  const [events, setEvents] = useState<EventDraft[]>([createEventDraft()]);
  const [annualClubIds, setAnnualClubIds] = useState<string[]>([]);
  const [annualSendAt, setAnnualSendAt] = useState("");
  const [annualClosesAt, setAnnualClosesAt] = useState("");
  const [sharedSendAt, setSharedSendAt] = useState("");
  const [sharedClosesAt, setSharedClosesAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = templates.find((template) => template.id === templateId);
  const isAnnual = selectedTemplate?.surveyType === "ANNUAL";
  const steps = isAnnual
    ? ["Vælg skabelon", "Vælg klubber", "Sæt sendetidspunkt", "Bekræft"]
    : ["Vælg skabelon", "Opret arrangementer", "Sæt sendetidspunkt", "Bekræft"];
  const completeEventDetails = events.every(
    (event) => event.clubId && event.title.trim() && event.eventDate && event.location.trim() && event.eventType.trim(),
  );
  const completeEventSendTimes = events.every((event) => event.sendAt && event.closesAt);
  const completeAnnualSendTimes = annualSendAt && annualClosesAt;

  const payload = useMemo(() => {
    if (!selectedTemplate) {
      return "";
    }

    if (selectedTemplate.surveyType === "ANNUAL") {
      if (!annualClubIds.length || !completeAnnualSendTimes) {
        return "";
      }

      return JSON.stringify({
        mode: "ANNUAL",
        templateId: selectedTemplate.id,
        clubIds: annualClubIds,
        sendAt: new Date(annualSendAt).toISOString(),
        closesAt: new Date(annualClosesAt).toISOString(),
      });
    }

    if (!completeEventDetails || !completeEventSendTimes) {
      return "";
    }

    return JSON.stringify({
      mode: "EVENT",
      templateId: selectedTemplate.id,
      events: events.map((event) => ({
        clubId: event.clubId,
        title: event.title.trim(),
        eventDate: event.eventDate,
        location: event.location.trim(),
        eventType: event.eventType.trim(),
        // datetime-local is entered in the administrator's local timezone.
        sendAt: new Date(event.sendAt).toISOString(),
        closesAt: new Date(event.closesAt).toISOString(),
      })),
    });
  }, [annualClubIds, annualClosesAt, annualSendAt, completeAnnualSendTimes, completeEventDetails, completeEventSendTimes, events, selectedTemplate]);

  function updateEvent(id: string, field: keyof Omit<EventDraft, "id">, value: string) {
    setEvents((current) => current.map((event) => (event.id === id ? { ...event, [field]: value } : event)));
  }

  function toggleAnnualClub(clubId: string) {
    setAnnualClubIds((current) => current.includes(clubId) ? current.filter((id) => id !== clubId) : [...current, clubId]);
  }

  function goNext() {
    if (step === 1 && !selectedTemplate) {
      setError("Vælg en aktiv spørgeskemaskabelon for at fortsætte.");
      return;
    }
    if (step === 2 && isAnnual && annualClubIds.length === 0) {
      setError("Vælg mindst én klub til den årlige måling.");
      return;
    }
    if (step === 2 && !isAnnual && !completeEventDetails) {
      setError("Udfyld klub, titel, dato, lokation og eventtype for alle arrangementer.");
      return;
    }
    if (step === 3 && isAnnual && !completeAnnualSendTimes) {
      setError("Angiv både sendetidspunkt og lukketidspunkt.");
      return;
    }
    if (step === 3 && !isAnnual && !completeEventSendTimes) {
      setError("Angiv både sendetidspunkt og lukketidspunkt for alle arrangementer.");
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

  function applySharedCloseTime() {
    if (!sharedClosesAt) {
      setError("Vælg først et fælles lukketidspunkt.");
      return;
    }
    setEvents((current) => current.map((event) => ({ ...event, closesAt: sharedClosesAt })));
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
          <p className="mt-1 text-sm text-muted-foreground">Vælg en årlig måling eller en arrangementsevaluering. Guiden tilpasser de næste trin til dit valg.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {templates.map((template) => (
              <label key={template.id} className={`cursor-pointer rounded-2xl border p-5 transition ${template.id === templateId ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/30"}`}>
                <input type="radio" name="template" value={template.id} checked={template.id === templateId} onChange={() => setTemplateId(template.id)} className="sr-only" />
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{template.name}</p>
                  <span className="shrink-0 rounded-full border border-border/70 bg-muted/20 px-2.5 py-1 text-xs font-medium text-muted-foreground">{typeLabels[template.surveyType]}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
                <p className="mt-4 text-xs font-medium text-muted-foreground">{template.questionCount} spørgsmål</p>
              </label>
            ))}
          </div>
          {templates.length === 0 ? <p className="mt-5 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Der findes ingen aktive skabeloner. Opret eller aktivér en under Spørgsmål & skabeloner.</p> : null}
        </section>
      ) : null}

      {step === 2 && isAnnual ? (
        <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Vælg klubber</h2>
              <p className="mt-1 text-sm text-muted-foreground">Der oprettes én selvstændig årlig måling for hver valgt klub.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAnnualClubIds(clubs.map((club) => club.id))} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">Vælg alle</button>
              <button type="button" onClick={() => setAnnualClubIds([])} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">Ryd</button>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {clubs.map((club) => {
              const isSelected = annualClubIds.includes(club.id);
              return (
                <label key={club.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/30"}`}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleAnnualClub(club.id)} className="h-4 w-4 accent-primary" />
                  <span className="font-medium">{club.name}</span>
                </label>
              );
            })}
          </div>
        </section>
      ) : null}

      {step === 2 && !isAnnual ? (
        <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Opret arrangementer</h2>
              <p className="mt-1 text-sm text-muted-foreground">Tilføj ét eller flere arrangementer til skabelonen.</p>
            </div>
            <button type="button" onClick={() => setEvents((current) => [...current, createEventDraft()])} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">+ Tilføj arrangement</button>
          </div>

          <div className="mt-6 space-y-5">
            {events.map((event, index) => (
              <article key={event.id} className="rounded-2xl border bg-background p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="font-semibold">Arrangement {index + 1}</h3>
                  {events.length > 1 ? <button type="button" onClick={() => setEvents((current) => current.filter((item) => item.id !== event.id))} className="text-sm font-medium text-red-700 hover:underline">Fjern</button> : null}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <select value={event.clubId} onChange={(input) => updateEvent(event.id, "clubId", input.target.value)}><option value="">Vælg klub</option>{clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}</select>
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

      {step === 3 && isAnnual ? (
        <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Sæt sendetidspunkt</h2>
          <p className="mt-1 text-sm text-muted-foreground">Samme tidspunkt bruges for alle {annualClubIds.length} valgte {annualClubIds.length === 1 ? "klub" : "klubber"}.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium">Sendes<input className="mt-1" type="datetime-local" value={annualSendAt} onChange={(input) => setAnnualSendAt(input.target.value)} /></label>
            <label className="text-sm font-medium">Lukker<input className="mt-1" type="datetime-local" value={annualClosesAt} onChange={(input) => setAnnualClosesAt(input.target.value)} /></label>
          </div>
        </section>
      ) : null}

      {step === 3 && !isAnnual ? (
        <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Sæt sendetidspunkt</h2>
          <p className="mt-1 text-sm text-muted-foreground">Vælg, hvornår invitationen sendes og hvornår spørgeskemaet lukker.</p>
          <div className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border bg-muted/15 p-4">
            <label className="min-w-[260px] flex-1 text-sm font-medium">Fælles sendetidspunkt<input className="mt-1" type="datetime-local" value={sharedSendAt} onChange={(input) => setSharedSendAt(input.target.value)} /></label>
            <button type="button" onClick={applySharedSendTime} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Brug for alle</button>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl border bg-muted/15 p-4">
            <label className="min-w-[260px] flex-1 text-sm font-medium">Fælles lukketidspunkt<input className="mt-1" type="datetime-local" value={sharedClosesAt} onChange={(input) => setSharedClosesAt(input.target.value)} /></label>
            <button type="button" onClick={applySharedCloseTime} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Brug for alle</button>
          </div>
          <div className="mt-5 space-y-3">
            {events.map((event, index) => (
              <div key={event.id} className="grid gap-3 rounded-2xl border bg-background p-4 md:grid-cols-[minmax(0,1fr)_220px_220px] md:items-end">
                <div><p className="font-medium">{event.title || `Arrangement ${index + 1}`}</p><p className="mt-1 text-sm text-muted-foreground">{clubs.find((club) => club.id === event.clubId)?.name ?? "Klub ikke valgt"} · {event.eventDate || "Dato ikke valgt"}</p></div>
                <label className="text-sm font-medium">Sendes<input className="mt-1" type="datetime-local" value={event.sendAt} onChange={(input) => updateEvent(event.id, "sendAt", input.target.value)} /></label>
                <label className="text-sm font-medium">Lukker<input className="mt-1" type="datetime-local" value={event.closesAt} onChange={(input) => updateEvent(event.id, "closesAt", input.target.value)} /></label>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {step === 4 && selectedTemplate ? (
        <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Bekræft og opret</h2>
          <p className="mt-1 text-sm text-muted-foreground">{isAnnual ? "Der oprettes en selvstændig årlig måling og planlagt udsendelse for hver valgt klub." : "Der oprettes arrangement, spørgeskema og planlagt udsendelse for hver række."}</p>
          <div className="mt-5 rounded-2xl border bg-muted/15 p-5"><p className="text-sm text-muted-foreground">Skabelon</p><p className="mt-1 font-semibold">{selectedTemplate.name}</p><p className="mt-1 text-sm text-muted-foreground">{typeLabels[selectedTemplate.surveyType]}</p></div>

          {isAnnual ? (
            <div className="mt-4 space-y-3">
              {annualClubIds.map((clubId, index) => <article key={clubId} className="rounded-2xl border bg-background p-5"><p className="font-semibold">{index + 1}. {clubs.find((club) => club.id === clubId)?.name}</p><div className="mt-3 grid gap-3 text-sm text-muted-foreground md:grid-cols-2"><p><span className="block text-xs uppercase tracking-wide">Sendes</span>{formatDateTime(annualSendAt)}</p><p><span className="block text-xs uppercase tracking-wide">Lukker</span>{formatDateTime(annualClosesAt)}</p></div></article>)}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {events.map((event, index) => <article key={event.id} className="rounded-2xl border bg-background p-5"><p className="font-semibold">{index + 1}. {event.title}</p><div className="mt-3 grid gap-3 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-5"><p><span className="block text-xs uppercase tracking-wide">Klub</span>{clubs.find((club) => club.id === event.clubId)?.name}</p><p><span className="block text-xs uppercase tracking-wide">Event</span>{event.eventDate} · {event.eventType}</p><p><span className="block text-xs uppercase tracking-wide">Lokation</span>{event.location}</p><p><span className="block text-xs uppercase tracking-wide">Sendes</span>{formatDateTime(event.sendAt)}</p><p><span className="block text-xs uppercase tracking-wide">Lukker</span>{formatDateTime(event.closesAt)}</p></div></article>)}
            </div>
          )}

          <form action={createBatchAction} className="mt-6"><input type="hidden" name="payload" value={payload} /><button type="submit" disabled={!payload} className="rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{isAnnual ? `Opret ${annualClubIds.length} ${annualClubIds.length === 1 ? "årlig måling" : "årlige målinger"} og planlæg udsendelse` : `Opret ${events.length} ${events.length === 1 ? "arrangement" : "arrangementer"} og planlæg udsendelse`}</button></form>
        </section>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => { setError(null); setStep((current) => Math.max(current - 1, 1)); }} disabled={step === 1} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">Tilbage</button>
        {step < 4 ? <button type="button" onClick={goNext} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Fortsæt</button> : null}
      </div>
    </div>
  );
}
