-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('DMU_ADMIN', 'CLUB_ADMIN');

-- CreateEnum
CREATE TYPE "public"."AgeGroup" AS ENUM ('UNDER_18', 'AGE_18_30', 'AGE_31_50', 'AGE_51_PLUS');

-- CreateEnum
CREATE TYPE "public"."RaceClass" AS ENUM ('MOTOCROSS', 'ENDURO', 'SPEEDWAY', 'TRIAL');

-- CreateEnum
CREATE TYPE "public"."MemberRole" AS ENUM ('RIDER', 'VOLUNTEER');

-- CreateEnum
CREATE TYPE "public"."QuestionType" AS ENUM ('SCALE_1_5', 'SINGLE_CHOICE', 'TEXT');

-- CreateEnum
CREATE TYPE "public"."QuestionScope" AS ENUM ('DMU_STANDARD', 'CLUB_CUSTOM');

-- CreateEnum
CREATE TYPE "public"."SurveyType" AS ENUM ('ANNUAL', 'EVENT');

-- CreateEnum
CREATE TYPE "public"."SurveyStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENT', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."SurveyInstanceQuestionSource" AS ENUM ('CORE', 'CLUB_ADDED');

-- CreateEnum
CREATE TYPE "public"."ScheduledSendStatus" AS ENUM ('PENDING', 'PROCESSED');

-- CreateEnum
CREATE TYPE "public"."ScheduledSendTriggerType" AS ENUM ('MANUAL', 'EVENT_PLUS_1_DAY');

-- CreateEnum
CREATE TYPE "public"."InvitationStatus" AS ENUM ('CREATED', 'SENT', 'OPENED', 'ANSWERED');

-- CreateEnum
CREATE TYPE "public"."InvitationDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."MailStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "public"."UserRole" NOT NULL,
    "clubId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Club" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ClubExtraEmail" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubExtraEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Member" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ageGroup" "public"."AgeGroup" NOT NULL,
    "raceClass" "public"."RaceClass" NOT NULL,
    "memberRole" "public"."MemberRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Question" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "questionType" "public"."QuestionType" NOT NULL,
    "scope" "public"."QuestionScope" NOT NULL,
    "benchmarkKey" TEXT,
    "createdByClubId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SurveyTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "surveyType" "public"."SurveyType" NOT NULL,
    "description" TEXT NOT NULL,
    "layoutJson" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SurveyTemplateQuestion" (
    "id" TEXT NOT NULL,
    "surveyTemplateId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "isCoreBenchmarkQuestion" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SurveyTemplateQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SurveyInstance" (
    "id" TEXT NOT NULL,
    "surveyTemplateId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "surveyType" "public"."SurveyType" NOT NULL,
    "status" "public"."SurveyStatus" NOT NULL DEFAULT 'DRAFT',
    "eventId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "clubReadyAt" TIMESTAMP(3),
    "clubReadyByUserId" TEXT,
    "sentAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SurveyInstanceQuestion" (
    "id" TEXT NOT NULL,
    "surveyInstanceId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sourceType" "public"."SurveyInstanceQuestionSource" NOT NULL,

    CONSTRAINT "SurveyInstanceQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Event" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EventParticipant" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ScheduledSend" (
    "id" TEXT NOT NULL,
    "surveyInstanceId" TEXT NOT NULL,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "status" "public"."ScheduledSendStatus" NOT NULL DEFAULT 'PENDING',
    "triggerType" "public"."ScheduledSendTriggerType" NOT NULL,
    "processedAt" TIMESTAMP(3),
    "processingStartedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduledSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SurveyInvitation" (
    "id" TEXT NOT NULL,
    "surveyInstanceId" TEXT NOT NULL,
    "memberId" TEXT,
    "eventParticipantId" TEXT,
    "emailSnapshot" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tokenCiphertext" TEXT,
    "status" "public"."InvitationStatus" NOT NULL DEFAULT 'CREATED',
    "deliveryStatus" "public"."InvitationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastDeliveryAttemptAt" TIMESTAMP(3),
    "nextDeliveryAttemptAt" TIMESTAMP(3),
    "lastDeliveryError" TEXT,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyInstanceId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ageGroup" "public"."AgeGroup" NOT NULL,
    "raceClass" "public"."RaceClass" NOT NULL,
    "memberRole" "public"."MemberRole" NOT NULL,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SurveyAnswer" (
    "id" TEXT NOT NULL,
    "surveyResponseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "numericValue" INTEGER,
    "optionValue" TEXT,
    "textValue" TEXT,

    CONSTRAINT "SurveyAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MailLog" (
    "id" TEXT NOT NULL,
    "surveyInvitationId" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyPreview" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "status" "public"."MailStatus" NOT NULL,

    CONSTRAINT "MailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Club_name_key" ON "public"."Club"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ClubExtraEmail_clubId_email_key" ON "public"."ClubExtraEmail"("clubId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Member_email_key" ON "public"."Member"("email");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionOption_questionId_value_key" ON "public"."QuestionOption"("questionId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyTemplateQuestion_surveyTemplateId_questionId_key" ON "public"."SurveyTemplateQuestion"("surveyTemplateId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyInstanceQuestion_surveyInstanceId_questionId_key" ON "public"."SurveyInstanceQuestion"("surveyInstanceId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "EventParticipant_eventId_email_key" ON "public"."EventParticipant"("eventId", "email");

-- CreateIndex
CREATE INDEX "ScheduledSend_status_sendAt_idx" ON "public"."ScheduledSend"("status", "sendAt");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyInvitation_token_key" ON "public"."SurveyInvitation"("token");

-- CreateIndex
CREATE INDEX "SurveyInvitation_deliveryStatus_nextDeliveryAttemptAt_idx" ON "public"."SurveyInvitation"("deliveryStatus", "nextDeliveryAttemptAt");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClubExtraEmail" ADD CONSTRAINT "ClubExtraEmail_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Member" ADD CONSTRAINT "Member_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Question" ADD CONSTRAINT "Question_createdByClubId_fkey" FOREIGN KEY ("createdByClubId") REFERENCES "public"."Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SurveyTemplateQuestion" ADD CONSTRAINT "SurveyTemplateQuestion_surveyTemplateId_fkey" FOREIGN KEY ("surveyTemplateId") REFERENCES "public"."SurveyTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SurveyTemplateQuestion" ADD CONSTRAINT "SurveyTemplateQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SurveyInstance" ADD CONSTRAINT "SurveyInstance_surveyTemplateId_fkey" FOREIGN KEY ("surveyTemplateId") REFERENCES "public"."SurveyTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SurveyInstance" ADD CONSTRAINT "SurveyInstance_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SurveyInstance" ADD CONSTRAINT "SurveyInstance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SurveyInstance" ADD CONSTRAINT "SurveyInstance_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SurveyInstanceQuestion" ADD CONSTRAINT "SurveyInstanceQuestion_surveyInstanceId_fkey" FOREIGN KEY ("surveyInstanceId") REFERENCES "public"."SurveyInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SurveyInstanceQuestion" ADD CONSTRAINT "SurveyInstanceQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Event" ADD CONSTRAINT "Event_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Event" ADD CONSTRAINT "Event_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventParticipant" ADD CONSTRAINT "EventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ScheduledSend" ADD CONSTRAINT "ScheduledSend_surveyInstanceId_fkey" FOREIGN KEY ("surveyInstanceId") REFERENCES "public"."SurveyInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SurveyInvitation" ADD CONSTRAINT "SurveyInvitation_surveyInstanceId_fkey" FOREIGN KEY ("surveyInstanceId") REFERENCES "public"."SurveyInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SurveyInvitation" ADD CONSTRAINT "SurveyInvitation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "public"."Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SurveyInvitation" ADD CONSTRAINT "SurveyInvitation_eventParticipantId_fkey" FOREIGN KEY ("eventParticipantId") REFERENCES "public"."EventParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyInstanceId_fkey" FOREIGN KEY ("surveyInstanceId") REFERENCES "public"."SurveyInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SurveyResponse" ADD CONSTRAINT "SurveyResponse_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SurveyAnswer" ADD CONSTRAINT "SurveyAnswer_surveyResponseId_fkey" FOREIGN KEY ("surveyResponseId") REFERENCES "public"."SurveyResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SurveyAnswer" ADD CONSTRAINT "SurveyAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MailLog" ADD CONSTRAINT "MailLog_surveyInvitationId_fkey" FOREIGN KEY ("surveyInvitationId") REFERENCES "public"."SurveyInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
