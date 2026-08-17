import { NextResponse } from "next/server";
import { processDataRetention } from "@/lib/data-retention";
import { processDueScheduledSends } from "@/lib/scheduled-sends";

export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sendResult = await processDueScheduledSends();
    const retentionResult = await processDataRetention();
    return NextResponse.json({ ok: true, sends: sendResult, retention: retentionResult });
  } catch (error) {
    console.error("[cron] Could not process scheduled sends", error);
    return NextResponse.json({ error: "Could not process scheduled sends" }, { status: 500 });
  }
}
