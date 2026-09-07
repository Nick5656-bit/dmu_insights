import type { Prisma } from "@prisma/client";

export const TEMPLATE_LOCKED_MESSAGE = "Skabelonen er allerede brugt. Opret en kopi for at ændre indholdet uden at påvirke eksisterende undersøgelser.";

export async function lockUnusedTemplate(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "SurveyTemplate" WHERE id = ${id} FOR UPDATE`;
  const template = await tx.surveyTemplate.findUnique({ where: { id }, select: { _count: { select: { surveyInstances: true } } } });
  if (!template || template._count.surveyInstances > 0) throw new Error(TEMPLATE_LOCKED_MESSAGE);
}
