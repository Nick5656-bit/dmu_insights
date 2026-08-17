-- CreateEnum
CREATE TYPE "public"."ReminderStatus" AS ENUM ('NOT_SCHEDULED', 'PENDING', 'SENDING', 'SENT', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "public"."SurveyInvitation" ADD COLUMN     "reminderAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reminderLastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "reminderLastError" TEXT,
ADD COLUMN     "reminderNextAttemptAt" TIMESTAMP(3),
ADD COLUMN     "reminderScheduledAt" TIMESTAMP(3),
ADD COLUMN     "reminderSentAt" TIMESTAMP(3),
ADD COLUMN     "reminderStatus" "public"."ReminderStatus" NOT NULL DEFAULT 'NOT_SCHEDULED';

-- CreateIndex
CREATE INDEX "SurveyInvitation_reminderStatus_reminderNextAttemptAt_idx" ON "public"."SurveyInvitation"("reminderStatus", "reminderNextAttemptAt");
