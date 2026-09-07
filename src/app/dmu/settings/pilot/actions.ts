"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pilotClubSchema, pilotUserSchema, type PilotFormState } from "@/lib/pilot-setup";

function fields(form: FormData) {
  return { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") };
}

function creationError(error: unknown): PilotFormState {
  const duplicate = error && typeof error === "object" && "code" in error && error.code === "P2002";
  return { success: false, message: duplicate ? "Klubnavnet eller e-mailadressen findes allerede. Intet er overskrevet." : "Oprettelsen kunne ikke gennemføres. Intet er overskrevet. Prøv igen." };
}

export async function createPilotClub(_previous: PilotFormState, form: FormData): Promise<PilotFormState> {
  await requireRole("DMU_ADMIN");
  const parsed = pilotClubSchema.safeParse({ ...fields(form), clubName: String(form.get("clubName") ?? ""), city: String(form.get("city") ?? ""), dataMode: String(form.get("dataMode") ?? "") });
  if (!parsed.success) return { success: false, message: "Kontrollér felterne. Brug en gyldig e-mail og en adgangskode på mindst 12 tegn (højst 72 UTF-8 bytes)." };
  const input = parsed.data;
  try {
    const passwordHash = await bcrypt.hash(input.password, 12);
    // Nested create is atomic: duplicate user email cannot leave an orphan club behind.
    await prisma.club.create({ data: { name: input.clubName, city: input.city, isTest: input.dataMode === "test",
      users: { create: { name: input.name, email: input.email, passwordHash, role: "CLUB_ADMIN" } } } });
  } catch (error) { return creationError(error); }
  revalidatePath("/dmu/settings/pilot");
  revalidatePath("/dmu/settings/club-users");
  revalidatePath("/dmu/send");
  revalidatePath("/dmu/dashboard");
  return { success: true, message: "Klubben og den personlige klubadministrator er oprettet. Der er ikke sendt nogen mails." };
}

export async function createPersonalDmuAdmin(_previous: PilotFormState, form: FormData): Promise<PilotFormState> {
  await requireRole("DMU_ADMIN");
  const parsed = pilotUserSchema.safeParse(fields(form));
  if (!parsed.success) return { success: false, message: "Kontrollér navn og e-mail. Adgangskoden skal være mindst 12 tegn og højst 72 UTF-8 bytes." };
  try {
    const { name, email, password } = parsed.data;
    await prisma.user.create({ data: { name, email, passwordHash: await bcrypt.hash(password, 12), role: "DMU_ADMIN" } });
  } catch (error) { return creationError(error); }
  revalidatePath("/dmu/settings/pilot");
  return { success: true, message: "Den personlige DMU-administrator er oprettet. Test login i et privat vindue. Demo-adgangen er ikke ændret." };
}
