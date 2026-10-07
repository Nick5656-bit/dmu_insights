import { parseSelectionIds, parseDashboardYear } from "@/lib/dashboard-filters";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadSurveyResults } from "@/lib/survey-results.server";
import { resultsCsv, surveyYearWhere } from "@/lib/survey-results";
import { isMotocrossClass, isRespondentAgeGroup, isRespondentRole } from "@/lib/survey-segments";
import { dashboardMotocrossClassOptions, dashboardRespondentAgeGroupOptions, dashboardRespondentRoleOptions } from "@/lib/survey-segments";
import { loadResultOverview } from "@/lib/result-overview.server";
import { overviewQuestions } from "@/lib/result-overview";
import { renderResultsPdf } from "@/lib/results-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  if (searchParams.get("format") === "pdf") {
    const instances = await prisma.surveyInstance.findMany({
      where: instanceWhere,
      select: { id: true, name: true, club: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    if (surveyInstanceIds.some(id => !instances.some(instance => instance.id === id))) {
      return NextResponse.json({ error: "Et valgt arrangement er ikke tilgængeligt med disse filtre." }, { status: 400 });
    }
    const filters = [
      instances.length ? `Arrangementer / udsendelser: ${instances.map(instance => `${instance.name} (${instance.club.name})`).join("; ")}` : "Ingen arrangementer eller udsendelser i det valgte udsnit.",
      `Alder: ${dashboardRespondentAgeGroupOptions.find(option => option.value === respondentAgeGroup)?.label ?? "Alle aldre"}`,
      `Klasse: ${dashboardMotocrossClassOptions.find(option => option.value === motocrossClass)?.label ?? "Alle klasser"}`,
      `Rolle: ${dashboardRespondentRoleOptions.find(option => option.value === respondentRole)?.label ?? "Alle roller"}`,
    ];
    const comparison = surveyInstanceIds.length > 1;
    const series = comparison ? await loadResultOverview(responseWhere, instanceWhere) : [{
      id: "combined", label: surveyInstanceIds.length === 1 ? instances[0].name : "Samlede resultater", questions: overviewQuestions(results),
    }];
    try {
      const pdf = await renderResultsPdf({ scope: exportScope, filters, results, series, comparison });
      return new NextResponse(new Uint8Array(pdf), { headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="dmu-resultater-${new Date().toISOString().slice(0, 10)}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      } });
    } catch {
      return NextResponse.json({ error: "PDF-rapporten kunne ikke oprettes. Prøv igen eller brug CSV-eksporten." }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }
  }
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
