"use client";

import { useEffect } from "react";

export function TemplateCreatedNotice({ templateId }: { templateId: string }) {
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const template = document.getElementById(`template-${templateId}`);
      template?.scrollIntoView({ behavior: "smooth", block: "center" });
      template?.focus({ preventScroll: true });
    }, 100);

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("created");
    window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);

    return () => window.clearTimeout(timeout);
  }, [templateId]);

  return (
    <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
      <span className="font-semibold">Skabelonen er oprettet.</span>
    </div>
  );
}
