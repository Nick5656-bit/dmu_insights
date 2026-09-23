"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { PasswordInput } from "@/components/password-input";

export function EditClubUserButton({
  action,
  userId,
  userName,
  userEmail,
}: {
  action: (formData: FormData) => Promise<void>;
  userId: string;
  userName: string;
  userEmail: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button
        type="button"
        className="min-h-11 rounded-md border px-3 py-1 text-sm hover:bg-muted sm:min-h-0 sm:text-xs"
        onClick={() => setIsOpen(true)}
      >
        Rediger
      </button>
    );
  }

  return (
    <div className="w-full min-w-0 rounded-lg border bg-background p-3 text-left shadow-sm sm:min-w-[20rem] sm:w-auto">
      <form action={action} className="space-y-2">
        <input type="hidden" name="userId" value={userId} />
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`edit-name-${userId}`}>
            Navn
          </label>
          <input
            id={`edit-name-${userId}`}
            name="name"
            defaultValue={userName}
            required
            className="min-h-11 w-full rounded-md border px-2 py-1.5 text-base sm:min-h-0 sm:text-xs"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`edit-email-${userId}`}>
            E-mail
          </label>
          <input
            id={`edit-email-${userId}`}
            type="email"
            name="email"
            defaultValue={userEmail}
            required
            className="min-h-11 w-full rounded-md border px-2 py-1.5 text-base sm:min-h-0 sm:text-xs"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`edit-password-${userId}`}>
            Ny adgangskode (valgfri)
          </label>
          <PasswordInput
            id={`edit-password-${userId}`}
            name="password"
            minLength={12}
            maxLength={72}
            autoComplete="new-password"
            placeholder="Lad stå tom for at beholde nuværende"
            className="min-h-11 w-full rounded-md border px-2 py-1.5 text-base sm:min-h-0 sm:text-xs"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            className="min-h-11 rounded-md border px-3 py-1 text-sm hover:bg-muted sm:min-h-0 sm:text-xs"
            onClick={() => setIsOpen(false)}
          >
            Annuller
          </button>
          <SubmitButton pendingText="Gemmer..." className="min-h-11 rounded-md bg-foreground px-3 py-1 text-sm font-medium text-background hover:bg-foreground/80 sm:min-h-0 sm:text-xs">
            Gem
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
