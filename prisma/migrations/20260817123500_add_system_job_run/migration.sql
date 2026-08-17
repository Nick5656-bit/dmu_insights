-- CreateEnum
CREATE TYPE "public"."SystemJobRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "public"."SystemJobRun" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" "public"."SystemJobRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "summary" JSONB,
    "errorMessage" TEXT,

    CONSTRAINT "SystemJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemJobRun_jobName_startedAt_idx" ON "public"."SystemJobRun"("jobName", "startedAt");
