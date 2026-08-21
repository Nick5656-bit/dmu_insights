"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

function isPersonalSurveyLink(url: string) {
  // A survey URL contains a single-use token and must never be included in traffic analytics.
  return url.includes("/survey/");
}

export function VercelAnalytics() {
  return (
    <>
      <Analytics beforeSend={(event: BeforeSendEvent) => (isPersonalSurveyLink(event.url) ? null : event)} />
      <SpeedInsights beforeSend={(event) => (isPersonalSurveyLink(event.url) ? null : event)} />
    </>
  );
}
