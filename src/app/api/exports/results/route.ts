import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadSurveyResults } from "@/lib/survey-results.server";
import { resultsCsv, surveyYearWhere } from "@/lib/survey-results";
import { isMotocrossClass, isRespondentAgeGroup, isRespondentRole } from "@/lib/survey-segments";


function parseClubIds(rawValue: string | null) {
  if (!rawValue) {
    return [];
  }

  return [...new Set(rawValue.split(",").map((value) => value.trim()).filter(Boolean))];
}

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
  const surveyInstanceId = searchParams.get("surveyInstanceId");

  const responseWhere: Prisma.SurveyResponseWhereInput = {
    ...(respondentAgeGroup && isRespondentAgeGroup(respondentAgeGroup) ? { respondentAgeGroup } : {}),
    ...(motocrossClass && isMotocrossClass(motocrossClass) ? { motocrossClass } : {}),
    ...(respondentRole && isRespondentRole(respondentRole) ? { respondentRole } : {}),
  };

  let exportScope = "Hele DMU";

  if (session.role === "CLUB_ADMIN") {
    if (!session.clubId) {
      return NextResponse.json({ error: "Club membership is required" }, { status: 403 });
    }

    responseWhere.clubId = session.clubId;
    if (surveyInstanceId) {
      responseWhere.surveyInstanceId = surveyInstanceId;
    }
    const club = await prisma.club.findUnique({ where: { id: session.clubId }, select: { isTest: true } });
    if (!club) return NextResponse.json({ error: "Club not found" }, { status: 403 });
    exportScope = `${club.isTest ? "TESTDATA" : "PILOTDATA"} – Klubbens valgte udsnit`;
  } else {
    const selectedClubIds = parseClubIds(searchParams.get("clubIds"));
    if (selectedClubIds.length > 0) {
      responseWhere.clubId = { in: selectedClubIds };
      exportScope = `${selectedClubIds.length} valgte klubber`;
    }

    if (surveyTemplateId) {
      const instances = await prisma.surveyInstance.findMany({
        where: {
          surveyTemplateId,
          ...(selectedClubIds.length > 0 ? { clubId: { in: selectedClubIds } } : {}),
        },
        select: { id: true, surveyTemplate: { select: { name: true } } },
      });

      responseWhere.surveyInstanceId = { in: instances.map((instance) => instance.id) };
      exportScope = instances[0]?.surveyTemplate.name ?? "Valgt skabelon";
    }
  }

  if (session.role !== "DMU_ADMIN" && session.role !== "CLUB_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const instanceWhere: Prisma.SurveyInstanceWhereInput = session.role === "CLUB_ADMIN"
    ? { clubId: session.clubId!, ...(surveyInstanceId ? { id: surveyInstanceId } : {}) }
    : {
        ...(surveyTemplateId ? { surveyTemplateId } : {}),
        ...(parseClubIds(searchParams.get("clubIds")).length ? { clubId: { in: parseClubIds(searchParams.get("clubIds")) } } : {}),
      };
  if (session.role === "DMU_ADMIN") {
    instanceWhere.club = { isTest: searchParams.get("dataMode") === "test" };
    exportScope = `${searchParams.get("dataMode") === "test" ? "TESTDATA" : "PILOTDATA"} – ${exportScope}`;
    const year = searchParams.get("year");
    if (year !== "all") Object.assign(instanceWhere, surveyYearWhere(year && /^\d{4}$/.test(year) ? Number(year) : new Date().getUTCFullYear()));
  }
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
