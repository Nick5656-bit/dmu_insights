"use client";

import { useActionState } from "react";
import type { PilotFormState } from "@/lib/pilot-setup";
import { SubmitButton } from "@/components/submit-button";

export function PilotSetupForm({ club = false, action }: { club?: boolean; action: (state: PilotFormState, form: FormData) => Promise<PilotFormState> }) {
  const [state, formAction, pending] = useActionState(action, { success: false, message: "" });
  return <form action={formAction} className="mt-4 space-y-4">
    {state.message && <p role={state.success ? "status" : "alert"} className={`rounded-xl border p-3 text-sm ${state.success ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>{state.message}</p>}
    <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
      {club && <>
        <label className="text-sm">Klubbens navn<input name="clubName" required minLength={2} maxLength={160} className="mt-1 w-full rounded-lg border p-2" /></label>
        <label className="text-sm">By<input name="city" required minLength={2} maxLength={100} className="mt-1 w-full rounded-lg border p-2" /></label>
        <label className="text-sm sm:col-span-2">Datatype<select name="dataMode" defaultValue="test" className="mt-1 w-full rounded-lg border p-2"><option value="test">Testklub – fiktive svar, ikke med i pilotresultater</option><option value="pilot">Pilotklub – rigtige besvarelser</option></select></label>
      </>}
      <label className="text-sm">Administratorens navn<input name="name" autoComplete="off" required minLength={2} maxLength={100} className="mt-1 w-full rounded-lg border p-2" /></label>
      <label className="text-sm">Administratorens e-mail<input name="email" type="email" autoComplete="off" required maxLength={254} className="mt-1 w-full rounded-lg border p-2" /></label>
      <label className="text-sm sm:col-span-2">Personlig adgangskode<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={72} className="mt-1 w-full rounded-lg border p-2" /></label>
    </fieldset>
    <p className="text-xs text-muted-foreground">Brug en unik adgangskode på mindst 12 tegn. Del den via en sikker kanal, ikke i chatten. Adgangskoden hashes; der sendes ikke automatisk en velkomstmail.</p>
    <SubmitButton pendingText="Opretter..." className="rounded-xl bg-primary px-4 py-2 font-medium text-primary-foreground">{club ? "Opret klub og administrator" : "Opret personlig DMU-administrator"}</SubmitButton>
  </form>;
}
