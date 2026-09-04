"use client";

import { SubmitButton } from "@/components/submit-button";

export function DeleteClubUserButton({
  action,
  userId,
  userName,
}: {
  action: (formData: FormData) => Promise<void>;
  userId: string;
  userName: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton
        pendingText="Sletter..."
        className="rounded-md border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
        onClick={(e) => {
          if (!confirm(`Slet ${userName}? Vedkommende mister adgang med det samme.`)) {
            e.preventDefault();
          }
        }}
      >
        Slet
      </SubmitButton>
    </form>
  );
}
