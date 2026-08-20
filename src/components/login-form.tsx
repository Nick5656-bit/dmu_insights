"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function LoginForm({ error }: { error?: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="mt-8 rounded-[1.8rem] border bg-background/88 p-6 shadow-[0_24px_60px_-44px_rgba(21,37,77,0.45)]"
      method="post"
      action="/api/auth/login"
      onSubmit={() => setLoading(true)}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
          >
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="E-mail"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
          >
            Adgangskode
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Adgangskode"
          />
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Button className="mt-5 w-full" size="default" type="submit" disabled={loading}>
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Logger ind…
          </span>
        ) : (
          "Log ind"
        )}
      </Button>
    </form>
  );
}
