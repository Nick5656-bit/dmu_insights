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
        className="min-h-11 rounded-md border border-red-200 px-3 py-1 text-sm text-red-600 hover:bg-red-50 sm:min-h-0 sm:text-xs"
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
