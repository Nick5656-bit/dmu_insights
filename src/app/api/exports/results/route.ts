import { parseSelectionIds, parseDashboardYear } from "@/lib/dashboard-filters";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadSurveyResults } from "@/lib/survey-results.server";
import { resultsCsv, surveyYearWhere } from "@/lib/survey-results";
import { isMotocrossClass, isRespondentAgeGroup, isRespondentRole } from "@/lib/survey-segments";


export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const respondentAgeGroup = searchParams.get("respondentAgeGroup");
  const motocrossClass = searchParams.get("motocrossClass");
  const respondentRole = searchParams.get("respondentRole");
  const surveyTemplateId = searchParams.get("surveyTemplateId");
  const surveyInstanceIds = parseSelectionIds(searchParams.getAll("surveyInstanceId"));
  const selectedClubIds = parseSelectionIds(searchParams.getAll("clubIds"));
  if (session.role !== "DMU_ADMIN" && session.role !== "CLUB_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const responseWhere: Prisma.SurveyResponseWhereInput = {
    ...(respondentAgeGroup && isRespondentAgeGroup(respondentAgeGroup) ? { respondentAgeGroup } : {}),
    ...(motocrossClass && isMotocrossClass(motocrossClass) ? { motocrossClass } : {}),
    ...(respondentRole && isRespondentRole(respondentRole) ? { respondentRole } : {}),
  };

  let exportScope = "Hele DMU";
  const instanceWhere: Prisma.SurveyInstanceWhereInput = {
    ...(surveyInstanceIds.length ? { id: { in: surveyInstanceIds } } : {}),
    ...(surveyTemplateId ? { surveyTemplateId } : {}),
  };
  if (surveyInstanceIds.length) responseWhere.surveyInstanceId = { in: surveyInstanceIds };
  if (session.role === "CLUB_ADMIN") {
    if (!session.clubId) return NextResponse.json({ error: "Club membership is required" }, { status: 403 });
    const club = await prisma.club.findUnique({ where: { id: session.clubId }, select: { isTest: true } });
    if (!club) return NextResponse.json({ error: "Club not found" }, { status: 403 });
    instanceWhere.clubId = session.clubId;
    responseWhere.clubId = session.clubId;
    // Club dashboard does not have template/year selectors. Ignore forged ones.
    delete instanceWhere.surveyTemplateId;
    exportScope = `${club.isTest ? "TESTDATA" : "PILOTDATA"} – Klubbens valgte udsnit`;
  } else {
    instanceWhere.club = { isTest: searchParams.get("dataMode") === "test" };
    if (selectedClubIds.length) {
      instanceWhere.clubId = { in: selectedClubIds };
      responseWhere.clubId = { in: selectedClubIds };
    }
    const year = parseDashboardYear(searchParams.get("year"));
    if (year !== null) Object.assign(instanceWhere, surveyYearWhere(year));
    exportScope = `${searchParams.get("dataMode") === "test" ? "TESTDATA" : "PILOTDATA"} – ${selectedClubIds.length ? selectedClubIds.length + " valgte klubber" : "Hele DMU"} · ${year ?? "Alle år"}`;
  }
  if (surveyInstanceIds.length) exportScope += ` · ${surveyInstanceIds.length} valgte arrangementer/udsendelser`;
  responseWhere.surveyInstance = instanceWhere;
  const results = await loadSurveyResults(responseWhere, instanceWhere);
  const csv = resultsCsv(results, exportScope);
  const filename = `dmu-resultater-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
