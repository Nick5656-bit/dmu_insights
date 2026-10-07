"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";

export function PdfExportButton({ href }: { href: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    if (pending) return;
    setPending(true); setError("");
    try {
      const url = new URL(href, window.location.origin);
      url.searchParams.set("format", "pdf");
      const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
      if (!response.ok || !response.headers.get("Content-Type")?.includes("application/pdf")) {
        throw new Error(response.status === 401 || response.status === 403 ? "Log ind igen for at eksportere rapporten." : "PDF-rapporten kunne ikke hentes. Prøv igen.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "dmu-resultater.pdf";
      document.body.appendChild(link); link.click(); link.remove();
      // Give mobile browsers time to begin their download before releasing it.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (error) {
      setError(error instanceof Error && error.name !== "TimeoutError" ? error.message : "Det tog for lang tid at hente PDF'en. Prøv igen.");
    } finally { setPending(false); }
  }
  return <div className="max-w-full">
    <button type="button" disabled={pending} aria-busy={pending} onClick={download}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/18 disabled:opacity-60 sm:min-h-0">
      {pending ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
      {pending ? "Opretter PDF..." : "Eksportér PDF"}
    </button>
    {error ? <p role="alert" className="mt-2 max-w-xs text-sm text-white">{error}</p> : null}
  </div>;
}
