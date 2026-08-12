import bcrypt from "bcryptjs";
import {
  AgeGroup,
  MemberRole,
  PrismaClient,
  QuestionScope,
  QuestionType,
  RaceClass,
  SurveyType,
  UserRole,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ── Ryd eksisterende data ──────────────────────────────────────────────────
  await prisma.mailLog.deleteMany();
  await prisma.surveyAnswer.deleteMany();
  await prisma.surveyResponse.deleteMany();
  await prisma.surveyInvitation.deleteMany();
  await prisma.scheduledSend.deleteMany();
  await prisma.surveyInstanceQuestion.deleteMany();
  await prisma.surveyInstance.deleteMany();
  await prisma.surveyTemplateQuestion.deleteMany();
  await prisma.surveyTemplate.deleteMany();
  await prisma.questionOption.deleteMany();
  await prisma.question.deleteMany();
  await prisma.event.deleteMany();
  await prisma.member.deleteMany();
  await prisma.user.deleteMany();
  await prisma.club.deleteMany();

  // ── DMU Administrator ──────────────────────────────────────────────────────
  const adminPasswordHash = await bcrypt.hash("demo1234", 10);

  await prisma.user.create({
    data: {
      name: "DMU Administrator",
      email: "admin@dmu.dk",
      passwordHash: adminPasswordHash,
      role: UserRole.DMU_ADMIN,
    },
  });

  console.log("✓ DMU Administrator oprettet (admin@dmu.dk / demo1234)");

  // ── Demo Klub ──────────────────────────────────────────────────────────────
  const demoClub = await prisma.club.create({
    data: {
      name: "Aarhus Motorsport Klub",
      city: "Aarhus",
      active: true,
    },
  });

  console.log("✓ Demo-klub oprettet: Aarhus Motorsport Klub");

  // ── Klub Administrator ─────────────────────────────────────────────────────
  const clubPasswordHash = await bcrypt.hash("demo1234", 10);

  await prisma.user.create({
    data: {
      name: "Klub Administrator",
      email: "klub1@dmu.dk",
      passwordHash: clubPasswordHash,
      role: UserRole.CLUB_ADMIN,
      clubId: demoClub.id,
    },
  });

  console.log("✓ Klub Administrator oprettet (klub1@dmu.dk / demo1234)");

  // ── Demo Medlemmer ─────────────────────────────────────────────────────────
  await prisma.member.createMany({
    data: [
      {
        clubId: demoClub.id,
        name: "Lars Jensen",
        email: "lars.jensen@demo.dk",
        ageGroup: AgeGroup.AGE_31_50,
        raceClass: RaceClass.MOTOCROSS,
        memberRole: MemberRole.RIDER,
        active: true,
      },
      {
        clubId: demoClub.id,
        name: "Mette Andersen",
        email: "mette.andersen@demo.dk",
        ageGroup: AgeGroup.AGE_18_30,
        raceClass: RaceClass.ENDURO,
        memberRole: MemberRole.RIDER,
        active: true,
      },
      {
        clubId: demoClub.id,
        name: "Peter Christensen",
        email: "peter.christensen@demo.dk",
        ageGroup: AgeGroup.AGE_51_PLUS,
        raceClass: RaceClass.TRIAL,
        memberRole: MemberRole.VOLUNTEER,
        active: true,
      },
      {
        clubId: demoClub.id,
        name: "Sofie Nielsen",
        email: "sofie.nielsen@demo.dk",
        ageGroup: AgeGroup.UNDER_18,
        raceClass: RaceClass.MOTOCROSS,
        memberRole: MemberRole.RIDER,
        active: true,
      },
      {
        clubId: demoClub.id,
        name: "Thomas Møller",
        email: "thomas.moller@demo.dk",
        ageGroup: AgeGroup.AGE_31_50,
        raceClass: RaceClass.SPEEDWAY,
        memberRole: MemberRole.RIDER,
        active: true,
      },
    ],
  });

  console.log("✓ 5 demo-medlemmer oprettet");

  // ── DMU Standardspørgsmål ──────────────────────────────────────────────────

  const qOverall = await prisma.question.create({
    data: {
      title: "Hvor tilfreds er du samlet set med klubben?",
      questionType: QuestionType.SCALE_1_5,
      scope: QuestionScope.DMU_STANDARD,
      benchmarkKey: "SATISFACTION_OVERALL",
      active: true,
    },
  });

  const qCommunication = await prisma.question.create({
    data: {
      title: "Hvor tilfreds er du med klubbens kommunikation?",
      questionType: QuestionType.SCALE_1_5,
      scope: QuestionScope.DMU_STANDARD,
      benchmarkKey: "SATISFACTION_COMMUNICATION",
      active: true,
    },
  });

  const qCommunity = await prisma.question.create({
    data: {
      title: "Hvordan oplever du fællesskabet i klubben?",
      questionType: QuestionType.SINGLE_CHOICE,
      scope: QuestionScope.DMU_STANDARD,
      benchmarkKey: "COMMUNITY_EXPERIENCE",
      active: true,
    },
  });

  await prisma.questionOption.createMany({
    data: [
      { questionId: qCommunity.id, label: "Meget positivt", value: "VERY_POSITIVE", sortOrder: 1 },
      { questionId: qCommunity.id, label: "Positivt", value: "POSITIVE", sortOrder: 2 },
      { questionId: qCommunity.id, label: "Neutralt", value: "NEUTRAL", sortOrder: 3 },
      { questionId: qCommunity.id, label: "Negativt", value: "NEGATIVE", sortOrder: 4 },
      { questionId: qCommunity.id, label: "Meget negativt", value: "VERY_NEGATIVE", sortOrder: 5 },
    ],
  });

  const qRecommend = await prisma.question.create({
    data: {
      title: "Hvor sandsynligt er det, at du anbefaler klubben til andre?",
      questionType: QuestionType.SCALE_1_5,
      scope: QuestionScope.DMU_STANDARD,
      benchmarkKey: "RECOMMENDATION",
      active: true,
    },
  });

  const qText = await prisma.question.create({
    data: {
      title: "Har du konkrete forslag til forbedringer i din klub?",
      questionType: QuestionType.TEXT,
      scope: QuestionScope.DMU_STANDARD,
      benchmarkKey: null,
      active: true,
    },
  });

  const qSafety = await prisma.question.create({
    data: {
      title: "Hvor tilfreds er du med sikkerheden på klubbens anlæg?",
      questionType: QuestionType.SCALE_1_5,
      scope: QuestionScope.DMU_STANDARD,
      benchmarkKey: "SAFETY",
      active: true,
    },
  });

  const qActivityValue = await prisma.question.create({
    data: {
      title: "Hvor godt udbytte oplever du af din deltagelse i klubbens aktiviteter?",
      questionType: QuestionType.SCALE_1_5,
      scope: QuestionScope.DMU_STANDARD,
      benchmarkKey: "ACTIVITY_VALUE",
      active: true,
    },
  });

  const qJoinReason = await prisma.question.create({
    data: {
      title: "Hvad er den primære årsag til, at du er aktiv i en DMU-klub?",
      questionType: QuestionType.SINGLE_CHOICE,
      scope: QuestionScope.DMU_STANDARD,
      benchmarkKey: "JOIN_REASON",
      active: true,
    },
  });

  await prisma.questionOption.createMany({
    data: [
      { questionId: qJoinReason.id, label: "Sport og konkurrence", value: "SPORT", sortOrder: 1 },
      { questionId: qJoinReason.id, label: "Fællesskab og socialt samvær", value: "COMMUNITY", sortOrder: 2 },
      { questionId: qJoinReason.id, label: "Familie/børns aktivitet", value: "FAMILY", sortOrder: 3 },
      { questionId: qJoinReason.id, label: "Hobbymæssig interesse", value: "HOBBY", sortOrder: 4 },
    ],
  });

  const qChurnRisk = await prisma.question.create({
    data: {
      title: "Overvejer du at stoppe som aktiv i din klub inden for de næste 12 måneder?",
      questionType: QuestionType.SINGLE_CHOICE,
      scope: QuestionScope.DMU_STANDARD,
      benchmarkKey: "CHURN_RISK",
      active: true,
    },
  });

  await prisma.questionOption.createMany({
    data: [
      { questionId: qChurnRisk.id, label: "Nej, bestemt ikke", value: "DEFINITELY_NOT", sortOrder: 1 },
      { questionId: qChurnRisk.id, label: "Nej, sandsynligvis ikke", value: "PROBABLY_NOT", sortOrder: 2 },
      { questionId: qChurnRisk.id, label: "Måske", value: "MAYBE", sortOrder: 3 },
      { questionId: qChurnRisk.id, label: "Ja, sandsynligvis", value: "PROBABLY_YES", sortOrder: 4 },
      { questionId: qChurnRisk.id, label: "Ja, bestemt", value: "DEFINITELY_YES", sortOrder: 5 },
    ],
  });

  const qDmuImprovement = await prisma.question.create({
    data: {
      title: "Hvad er én ting DMU centralt kan gøre, der ville styrke din klub?",
      questionType: QuestionType.TEXT,
      scope: QuestionScope.DMU_STANDARD,
      benchmarkKey: "DMU_CENTRAL_IMPROVEMENT",
      active: true,
    },
  });

  console.log("✓ Standardspørgsmål oprettet (10 stk.)");

  // ── Skabeloner ─────────────────────────────────────────────────────────────

  const annualTemplate = await prisma.surveyTemplate.create({
    data: {
      name: "Årlig medlemsmåling",
      surveyType: SurveyType.ANNUAL,
      description: "Central årlig måling med benchmarkbare DMU-standardspørgsmål.",
      isActive: true,
    },
  });

  const eventTemplate = await prisma.surveyTemplate.create({
    data: {
      name: "Event-feedback (kort)",
      surveyType: SurveyType.EVENT,
      description: "Kort eventsurvey til udsendelse dagen efter arrangementet.",
      isActive: true,
    },
  });

  // Årlig skabelon – alle spørgsmål
  const annualQuestions = [
    qOverall, qCommunication, qCommunity, qRecommend,
    qSafety, qActivityValue, qJoinReason, qChurnRisk,
    qText, qDmuImprovement,
  ];
  for (let i = 0; i < annualQuestions.length; i++) {
    const q = annualQuestions[i];
    await prisma.surveyTemplateQuestion.create({
      data: {
        surveyTemplateId: annualTemplate.id,
        questionId: q.id,
        sortOrder: i + 1,
        required: q.id !== qText.id && q.id !== qDmuImprovement.id,
        isCoreBenchmarkQuestion: [
          qOverall, qCommunication, qCommunity,
          qRecommend, qSafety, qActivityValue,
        ].some((bq) => bq.id === q.id),
      },
    });
  }

  // Event-skabelon – kortere udgave
  const eventQuestions = [qOverall, qCommunication, qCommunity, qRecommend, qSafety, qText];
  for (let i = 0; i < eventQuestions.length; i++) {
    await prisma.surveyTemplateQuestion.create({
      data: {
        surveyTemplateId: eventTemplate.id,
        questionId: eventQuestions[i].id,
        sortOrder: i + 1,
        required: eventQuestions[i].id !== qText.id,
        isCoreBenchmarkQuestion: i < 5,
      },
    });
  }

  console.log("✓ Skabeloner oprettet (Årlig + Event)");
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Seed gennemført. Næste skridt:");
  console.log("  1. Log ind med admin@dmu.dk / SkiftMig123!");
  console.log("  2. Skift adgangskoden med det samme!");
  console.log("  3. Opret klubber og klubbrugere under DMU → Klubbrugere");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
