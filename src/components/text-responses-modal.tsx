"use client";

import { useState } from "react";

export type TextResponseEntry = {
  text: string;
  clubName?: string; // shown in DMU view; hidden in club view
  submittedAt: string; // ISO string (Date not serializable from server)
};

type Props = {
  questionTitle: string;
  responses: TextResponseEntry[];
  triggerLabel?: string;
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function TextResponsesModal({
  questionTitle,
  responses,
  triggerLabel = "Se alle besvarelser",
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        <span>📋</span>
        {triggerLabel}
        <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {responses.length}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Modal panel */}
          <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border bg-background shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Tekstbesvarelser · {responses.length} svar
                </p>
                <h2 className="mt-0.5 text-base font-semibold leading-snug">
                  {questionTitle}
                </h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="ml-4 mt-0.5 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                aria-label="Luk"
              >
                ✕
              </button>
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {responses.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Ingen besvarelser endnu.
                </p>
              ) : (
                responses.map((r, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3"
                  >
                    <p className="text-sm leading-relaxed">{r.text}</p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      {r.clubName && (
                        <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                          {r.clubName}
                        </span>
                      )}
                      <span>{formatDate(r.submittedAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="border-t px-6 py-3">
              <button
                onClick={() => setOpen(false)}
                className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/80"
              >
                Luk
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
