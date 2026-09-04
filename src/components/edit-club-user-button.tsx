"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";

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
        className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
        onClick={() => setIsOpen(true)}
      >
        Rediger
      </button>
    );
  }

  return (
    <div className="rounded-lg border bg-background p-3 shadow-sm min-w-[20rem]">
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
            className="w-full rounded-md border px-2 py-1.5 text-xs"
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
            className="w-full rounded-md border px-2 py-1.5 text-xs"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`edit-password-${userId}`}>
            Ny adgangskode (valgfri)
          </label>
          <input
            id={`edit-password-${userId}`}
            type="text"
            name="password"
            minLength={6}
            placeholder="Lad stå tom for at beholde nuværende"
            className="w-full rounded-md border px-2 py-1.5 text-xs"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
            onClick={() => setIsOpen(false)}
          >
            Annuller
          </button>
          <SubmitButton pendingText="Gemmer..." className="rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background hover:bg-foreground/80">
            Gem
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
