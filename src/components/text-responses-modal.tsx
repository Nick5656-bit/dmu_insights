"use client";

import * as Dialog from "@radix-ui/react-dialog";

export type TextResponseEntry = {
  text: string;
  clubName?: string; // shown in DMU view; hidden in club view
  submittedAt?: string; // ISO string (Date not serializable from server)
};

type Props = {
  questionTitle: string;
  responses: TextResponseEntry[];
  triggerLabel?: string;
  showMetadata?: boolean;
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
  showMetadata = true,
}: Props) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted/50 transition-colors sm:min-h-0"
      >
        {triggerLabel}
        <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {responses.length}
        </span>
      </button>
      </Dialog.Trigger>

      <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border bg-background shadow-2xl sm:max-h-[85dvh] sm:w-[calc(100%-2rem)]">
            {/* Header */}
            <div className="flex shrink-0 items-start justify-between gap-2 border-b px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <Dialog.Description className="text-xs uppercase tracking-wide text-muted-foreground">
                  Tekstbesvarelser · {responses.length} svar
                </Dialog.Description>
                <Dialog.Title className="mt-0.5 break-words text-base font-semibold leading-snug">
                  {questionTitle}
                </Dialog.Title>
              </div>
              <Dialog.Close asChild>
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                aria-label="Luk"
              >
                ✕
              </button>
              </Dialog.Close>
            </div>

            {/* Scrollable list */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-3 sm:px-6">
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
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{r.text}</p>
                    {showMetadata && (r.clubName || r.submittedAt) && (
                    <div className="mt-2 flex flex-wrap items-center gap-3 break-words text-xs text-muted-foreground">
                      {r.clubName && (
                        <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                          {r.clubName}
                        </span>
                      )}
                      {r.submittedAt && <span>{formatDate(r.submittedAt)}</span>}
                    </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t px-4 py-3 sm:px-6">
              <Dialog.Close asChild>
              <button
                type="button"
                className="min-h-11 w-full rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/80 sm:w-auto"
              >
                Luk
              </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
