import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isMotocrossClass, isRespondentAgeGroup, isRespondentRole } from "@/lib/survey-segments";

const SUPPRESSION_THRESHOLD = 5;

function parseClubIds(rawValue: string | null) {
  if (!rawValue) {
    return [];
  }

  return [...new Set(rawValue.split(",").map((value) => value.trim()).filter(Boolean))];
}

function csvCell(value: string | number) {
  const rawText = String(value);
  // Avoid spreadsheet formula execution when an administrator-created label starts with a formula character.
  const text = /^[=+\-@]/.test(rawText.trimStart()) ? `'${rawText}` : rawText;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatCategory(benchmarkKey: string | null) {
  const category = benchmarkKey?.split("_")[0] ?? "GENEREL";
  return `${category.charAt(0)}${category.slice(1).toLowerCase()}`;
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
    exportScope = "Klubbens valgte udsnit";
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

  const questions = await prisma.question.findMany({
    where: {
      scope: "DMU_STANDARD",
      benchmarkKey: { not: null },
      questionType: "SCALE_1_5",
    },
    select: { id: true, title: true, benchmarkKey: true },
    orderBy: { createdAt: "asc" },
  });

  const answers = await prisma.surveyAnswer.findMany({
    where: {
      questionId: { in: questions.map((question) => question.id) },
      numericValue: { not: null },
      surveyResponse: responseWhere,
    },
    select: { questionId: true, numericValue: true },
  });

  const answersByQuestion = new Map<string, number[]>();
  for (const answer of answers) {
    if (answer.numericValue === null) {
      continue;
    }
    answersByQuestion.set(answer.questionId, [...(answersByQuestion.get(answer.questionId) ?? []), answer.numericValue]);
  }

  const rows = [
    ["DMU Survey Platform - samlet resultateksport"],
    ["Udsnit", exportScope],
    ["Anonymitetsregel", `Resultater med under ${SUPPRESSION_THRESHOLD} svar er skjult`],
    [],
    ["Kategori", "Spørgsmål", "Status", "Svar", "Gennemsnit", "Score 1", "Score 2", "Score 3", "Score 4", "Score 5"],
    ...questions.map((question) => {
      const values = answersByQuestion.get(question.id) ?? [];
      if (values.length < SUPPRESSION_THRESHOLD) {
        return [formatCategory(question.benchmarkKey), question.title, "Skjult af anonymitet", "", "", "", "", "", "", ""];
      }

      const distribution = [1, 2, 3, 4, 5].map((score) => values.filter((value) => value === score).length);
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      return [
        formatCategory(question.benchmarkKey),
        question.title,
        "Vises",
        values.length,
        average.toFixed(2),
        ...distribution,
      ];
    }),
  ];

  const csv = `\uFEFF${rows.map((row) => row.map((cell) => csvCell(cell ?? "")).join(";")).join("\r\n")}\r\n`;
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
