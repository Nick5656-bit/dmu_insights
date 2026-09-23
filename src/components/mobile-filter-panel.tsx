"use client";

import { useId, useState, type ReactNode } from "react";

export function MobileFilterPanel({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="mt-3">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-white/25 px-4 py-2 text-sm font-medium text-white sm:hidden">
      <span>{open ? "Skjul filtre" : "Filtre"}{count > 0 ? ` · ${count} aktive` : " · Alle resultater"}</span>
      <span aria-hidden="true">{open ? "−" : "+"}</span>
    </button>
    <div id={id} className={open ? "block" : "hidden sm:block"}>{children}</div>
  </div>;
}
