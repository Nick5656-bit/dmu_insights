"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

function excludePersonalSurveyLinks(event: BeforeSendEvent) {
  // A survey URL contains a single-use token and must never be included in traffic analytics.
  return event.url.includes("/survey/") ? null : event;
}

export function VercelAnalytics() {
  return <Analytics beforeSend={excludePersonalSurveyLinks} />;
}
