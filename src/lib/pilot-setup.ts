import { z } from "zod";

export const passwordSchema = z.string().min(12).refine((value) => Buffer.byteLength(value, "utf8") <= 72);

export const pilotUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  // bcrypt ignores bytes beyond 72; reject them rather than silently truncate.
  password: passwordSchema,
});

export const pilotClubSchema = pilotUserSchema.extend({
  clubName: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(100),
  dataMode: z.enum(["test", "pilot"]),
});

export type PilotFormState = { success: boolean; message: string };
export const emptyPilotFormState: PilotFormState = { success: false, message: "" };
