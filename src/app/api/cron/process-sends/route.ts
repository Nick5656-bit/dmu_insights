import { NextResponse } from "next/server";
import { processDataRetention } from "@/lib/data-retention";
import { prisma } from "@/lib/prisma";
import { processDueScheduledSends } from "@/lib/scheduled-sends";

export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let jobRunId: string | undefined;

  try {
    const jobRun = await prisma.systemJobRun.create({
      data: { jobName: "daily-maintenance" },
      select: { id: true },
    });
    jobRunId = jobRun.id;

    const sendResult = await processDueScheduledSends();
    const retentionResult = await processDataRetention();
    const result = { sends: sendResult, retention: retentionResult };

    await prisma.systemJobRun.update({
      where: { id: jobRun.id },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        summary: result,
      },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron] Could not process scheduled sends", error);

    if (jobRunId) {
      try {
        await prisma.systemJobRun.update({
          where: { id: jobRunId },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            errorMessage: "Systemkørslen fejlede. Se Vercel-loggene for tekniske detaljer.",
          },
        });
      } catch (jobRunError) {
        console.error("[cron] Could not record failed job run", jobRunError);
      }
    }

    return NextResponse.json({ error: "Could not process scheduled sends" }, { status: 500 });
  }
}
