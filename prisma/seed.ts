import bcrypt from "bcryptjs";
import {
  AgeGroup,
  InvitationStatus,
  MailStatus,
  MemberRole,
  PrismaClient,
  QuestionScope,
  QuestionType,
  RaceClass,
  ScheduledSendStatus,
  ScheduledSendTriggerType,
  SurveyInstanceQuestionSource,
  SurveyStatus,
  SurveyType,
  UserRole,
} from "@prisma/client";

const prisma = new PrismaClient();

const firstNames = [
  "Mads",
  "Lukas",
  "Emma",
  "Sofie",
  "Noah",
  "Alma",
  "Victor",
  "Laura",
  "Oliver",
  "Freja",
  "Anders",
  "Maja",
  "Kasper",
  "Ida",
  "Nikolaj",
  "Anna",
];

const lastNames = [
  "Jensen",
  "Nielsen",
  "Hansen",
  "Pedersen",
  "Andersen",
  "Larsen",
  "Christensen",
  "Sørensen",
  "Rasmussen",
  "Jørgensen",
];

const clubNames = [
  { name: "Nordkysten MX Klub", city: "Helsingør" },
  { name: "Midtjysk Enduro Forening", city: "Silkeborg" },
  { name: "Fyn Speedway Klub", city: "Odense" },
  { name: "Sydvest Trial Team", city: "Esbjerg" },
  { name: "Østsjælland Motorsport", city: "Køge" },
];

const positiveTexts = [
  "Super afvikling og god stemning i klubben.",
  "Føler mig velkommen og godt informeret.",
  "Frivillige gør et virkelig godt stykke arbejde.",
  "Baneforholdene var markant bedre i år.",
  "Trænerne er engagerede og lyttende.",
  "Fedt at se nye unge komme til og trives.",
  "Kommunikationen er forbedret meget det seneste år.",
  "Godt initiativ med det sociale arrangement efter sæsonafslutning.",
];

const criticalTexts = [
  "Kommunikation om træningstider kommer for sent.",
  "Det er svært at få hjælp som nyt medlem.",
  "Der mangler tydelig info om frivilligopgaver.",
  "For lang ventetid ved indskrivning på eventdagen.",
  "Banen trænger til vedligeholdelse og skilte ved farlige sving.",
  "Det er uklart hvem man skal kontakte med spørgsmål.",
  "Mangler et reelt velkomstprogram for børnefamilier.",
  "Prisen på kontingent føles høj ift. hvad man får.",
];

const dmuImprovementTexts = [
  "Bedre kommunikation om ændringer i reglementet til klubberne.",
  "Mere støtte til rekruttering af unge udøvere under 18 år.",
  "En samlet digital platform, hvor klubber kan dele erfaringer.",
  "Hjælp til at afvikle nationale begynderstævner lokalt.",
  "Tydeligere vejledning om forsikring og ansvar ved baneaktiviteter.",
  "Flere tilskudsmuligheder til vedligeholdelse af anlæg.",
  "At DMU holder regionale møder med klubformænd mindst én gang om året.",
  "Bedre markedsføring af sporten overfor potentielle nye medlemmer.",
  "En fælles app eller portal vi kan invitere klubmedlemmer ind i.",
  "Mere info om mulighederne for at certificere trænere og instruktører.",
  "At DMU laver skabeloner til nyhedsbreve vi kan bruge direkte i klubben.",
  "Simplere tilmeldings- og registreringsprocedurer ved stævner.",
];

const ageGroups = [AgeGroup.UNDER_18, AgeGroup.AGE_18_30, AgeGroup.AGE_31_50, AgeGroup.AGE_51_PLUS];
const raceClasses = [RaceClass.MOTOCROSS, RaceClass.ENDURO, RaceClass.SPEEDWAY, RaceClass.TRIAL];

function pick<T>(list: T[], index: number): T {
  return list[index % list.length];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildName(index: number) {
  return `${pick(firstNames, index)} ${pick(lastNames, index * 3)}`;
}

function createTextResponse(sentiment: number, index: number) {
  if (index % 6 === 0 || sentiment < 3.4) {
    return pick(criticalTexts, index);
  }
  return pick(positiveTexts, index);
}

function createDmuImprovementResponse(index: number) {
  return pick(dmuImprovementTexts, index);
}

async function main() {
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

  const passwordHash = await bcrypt.hash("demo1234", 10);

  const clubs = [] as { id: string; name: string }[];
  for (const clubData of clubNames) {
    const club = await prisma.club.create({ data: clubData });
    clubs.push({ id: club.id, name: club.name });
  }

  await prisma.user.create({
    data: {
      name: "DMU Administrator",
      email: "admin@dmu.dk",
      passwordHash,
      role: UserRole.DMU_ADMIN,
    },
  });

  const clubAdmins = [] as { id: string; clubId: string }[];
  for (let i = 0; i < clubs.length; i++) {
    const admin = await prisma.user.create({
      data: {
        name: `Klub Admin ${i + 1}`,
        email: `klub${i + 1}@dmu.dk`,
        passwordHash,
        role: UserRole.CLUB_ADMIN,
        clubId: clubs[i].id,
      },
    });
    clubAdmins.push({ id: admin.id, clubId: clubs[i].id });
  }

  const membersByClub = new Map<string, { id: string; ageGroup: AgeGroup; raceClass: RaceClass; memberRole: MemberRole; email: string }[]>();

  for (let clubIndex = 0; clubIndex < clubs.length; clubIndex++) {
    const club = clubs[clubIndex];
    const clubMembers = [] as { id: string; ageGroup: AgeGroup; raceClass: RaceClass; memberRole: MemberRole; email: string }[];

    for (let i = 0; i < 26; i++) {
      const globalIndex = clubIndex * 26 + i;
      const member = await prisma.member.create({
        data: {
          clubId: club.id,
          name: buildName(globalIndex),
          email: `member${globalIndex + 1}@example.dk`,
          ageGroup: pick(ageGroups, i + clubIndex),
          raceClass: pick(raceClasses, i + clubIndex * 2),
          memberRole: i % 5 === 0 ? MemberRole.VOLUNTEER : MemberRole.RIDER,
          active: true,
        },
      });

      clubMembers.push({
        id: member.id,
        email: member.email,
        ageGroup: member.ageGroup,
        raceClass: member.raceClass,
        memberRole: member.memberRole,
      });
    }

    membersByClub.set(club.id, clubMembers);
  }

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

  const annualTemplate = await prisma.surveyTemplate.create({
    data: {
      name: "Årlig medlemsmåling 2026",
      surveyType: SurveyType.ANNUAL,
      description: "Central årlig måling med benchmarkbare DMU-standardspørgsmål.",
      isActive: true,
    },
  });

  const eventTemplate = await prisma.surveyTemplate.create({
    data: {
      name: "Event-feedback (kort)",
      surveyType: SurveyType.EVENT,
      description: "Kort eventsurvey til udsendelse dagen efter event.",
      isActive: true,
    },
  });

  const annualCoreQuestions = [
    qOverall,
    qCommunication,
    qCommunity,
    qRecommend,
    qSafety,
    qActivityValue,
    qJoinReason,
    qChurnRisk,
    qText,
    qDmuImprovement,
  ];
  for (let i = 0; i < annualCoreQuestions.length; i++) {
    await prisma.surveyTemplateQuestion.create({
      data: {
        surveyTemplateId: annualTemplate.id,
        questionId: annualCoreQuestions[i].id,
        sortOrder: i + 1,
        required: annualCoreQuestions[i].id !== qText.id && annualCoreQuestions[i].id !== qDmuImprovement.id,
        isCoreBenchmarkQuestion: [qOverall, qCommunication, qCommunity, qRecommend, qSafety, qActivityValue].some(
          (q) => q.id === annualCoreQuestions[i].id
        ),
      },
    });
  }

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

  const annualSentiment = [4.4, 3.9, 3.3, 4.1, 2.9];
  const annualResponsesPerClub = [24, 20, 18, 22, 16];

  const annualInstances = [] as { id: string; clubId: string; questions: { id: string; type: QuestionType }[] }[];

  for (let clubIndex = 0; clubIndex < clubs.length; clubIndex++) {
    const club = clubs[clubIndex];
    const admin = clubAdmins.find((a) => a.clubId === club.id)!;

    const instance = await prisma.surveyInstance.create({
      data: {
        surveyTemplateId: annualTemplate.id,
        clubId: club.id,
        name: `Årlig måling 2026 - ${club.name}`,
        surveyType: SurveyType.ANNUAL,
        status: SurveyStatus.SENT,
        createdByUserId: admin.id,
        sentAt: new Date("2026-02-01T09:00:00.000Z"),
      },
    });

    const customQuestion = await prisma.question.create({
      data: {
        title: "Hvad bør klubben prioritere det næste halve år?",
        questionType: QuestionType.TEXT,
        scope: QuestionScope.CLUB_CUSTOM,
        benchmarkKey: null,
        createdByClubId: club.id,
        active: true,
      },
    });

    const coreQuestions = await prisma.surveyTemplateQuestion.findMany({
      where: { surveyTemplateId: annualTemplate.id },
      orderBy: { sortOrder: "asc" },
      include: { question: true },
    });

    for (const coreQuestion of coreQuestions) {
      await prisma.surveyInstanceQuestion.create({
        data: {
          surveyInstanceId: instance.id,
          questionId: coreQuestion.questionId,
          sortOrder: coreQuestion.sortOrder,
          required: coreQuestion.required,
          sourceType: SurveyInstanceQuestionSource.CORE,
        },
      });
    }

    await prisma.surveyInstanceQuestion.create({
      data: {
        surveyInstanceId: instance.id,
        questionId: customQuestion.id,
        sortOrder: 6,
        required: false,
        sourceType: SurveyInstanceQuestionSource.CLUB_ADDED,
      },
    });

    const members = membersByClub.get(club.id) ?? [];
    const invitations = [] as { id: string; memberId: string }[];

    for (const member of members) {
      const invitation = await prisma.surveyInvitation.create({
        data: {
          surveyInstanceId: instance.id,
          memberId: member.id,
          emailSnapshot: member.email,
          token: `annual-${instance.id}-${member.id}`,
          status: InvitationStatus.SENT,
          sentAt: new Date("2026-02-01T09:00:00.000Z"),
        },
      });

      invitations.push({ id: invitation.id, memberId: member.id });

      await prisma.mailLog.create({
        data: {
          surveyInvitationId: invitation.id,
          toEmail: member.email,
          subject: "DMU medlemssurvey fra din klub",
          bodyPreview: "Klik for at give anonym feedback via et kort spørgeskema.",
          sentAt: new Date("2026-02-01T09:00:00.000Z"),
          status: MailStatus.SENT,
        },
      });
    }

    const instanceQuestions = await prisma.surveyInstanceQuestion.findMany({
      where: { surveyInstanceId: instance.id },
      orderBy: { sortOrder: "asc" },
      include: { question: { include: { options: true } } },
    });

    const responseCount = annualResponsesPerClub[clubIndex];
    for (let i = 0; i < responseCount; i++) {
      const member = members[i];

      const forceSmallSegment = clubIndex === 0 && i < 3;
      const ageGroup = forceSmallSegment ? AgeGroup.UNDER_18 : member.ageGroup;
      const raceClass = forceSmallSegment ? RaceClass.TRIAL : member.raceClass;
      const memberRole = forceSmallSegment ? MemberRole.VOLUNTEER : member.memberRole;

      const response = await prisma.surveyResponse.create({
        data: {
          surveyInstanceId: instance.id,
          clubId: club.id,
          ageGroup,
          raceClass,
          memberRole,
          submittedAt: new Date(2026, 1, 2 + (i % 18), 10, (i * 7) % 60),
        },
      });

      for (const questionRef of instanceQuestions) {
        const question = questionRef.question;

        if (question.questionType === QuestionType.SCALE_1_5) {
          const jitter = ((i + clubIndex) % 3) - 1;
          const numericValue = clamp(Math.round(annualSentiment[clubIndex] + jitter), 1, 5);

          await prisma.surveyAnswer.create({
            data: {
              surveyResponseId: response.id,
              questionId: question.id,
              numericValue,
            },
          });
          continue;
        }

        if (question.questionType === QuestionType.SINGLE_CHOICE) {
          const sentiment = annualSentiment[clubIndex];
          let optionValue = "NEUTRAL";

          if (question.benchmarkKey === "JOIN_REASON") {
            const joinOptions = ["SPORT", "COMMUNITY", "FAMILY", "HOBBY"];
            optionValue = pick(joinOptions, i + clubIndex * 2);
          } else if (question.benchmarkKey === "CHURN_RISK") {
            if (sentiment >= 4.2) optionValue = i % 5 === 0 ? "PROBABLY_NOT" : "DEFINITELY_NOT";
            else if (sentiment >= 3.7) optionValue = i % 4 === 0 ? "MAYBE" : "PROBABLY_NOT";
            else if (sentiment >= 3.2) optionValue = i % 3 === 0 ? "PROBABLY_YES" : "MAYBE";
            else optionValue = i % 2 === 0 ? "PROBABLY_YES" : "DEFINITELY_YES";
          } else {
            // COMMUNITY_EXPERIENCE and similar sentiment-based options
            if (sentiment >= 4.2) optionValue = i % 3 === 0 ? "VERY_POSITIVE" : "POSITIVE";
            else if (sentiment >= 3.7) optionValue = i % 4 === 0 ? "NEUTRAL" : "POSITIVE";
            else if (sentiment >= 3.2) optionValue = i % 3 === 0 ? "NEGATIVE" : "NEUTRAL";
            else optionValue = i % 2 === 0 ? "NEGATIVE" : "VERY_NEGATIVE";
          }

          await prisma.surveyAnswer.create({
            data: {
              surveyResponseId: response.id,
              questionId: question.id,
              optionValue,
            },
          });
          continue;
        }

        if (question.questionType === QuestionType.TEXT) {
          const textValue =
            question.benchmarkKey === "DMU_CENTRAL_IMPROVEMENT"
              ? createDmuImprovementResponse(i + clubIndex * 3)
              : createTextResponse(annualSentiment[clubIndex], i + clubIndex);

          await prisma.surveyAnswer.create({
            data: {
              surveyResponseId: response.id,
              questionId: question.id,
              textValue,
            },
          });
        }
      }

      const invitation = invitations[i];
      if (invitation) {
        await prisma.surveyInvitation.update({
          where: { id: invitation.id },
          data: {
            status: InvitationStatus.ANSWERED,
            openedAt: new Date(2026, 1, 2 + (i % 18), 8, 0),
            answeredAt: new Date(2026, 1, 2 + (i % 18), 10, (i * 7) % 60),
          },
        });
      }
    }

    annualInstances.push({
      id: instance.id,
      clubId: club.id,
      questions: instanceQuestions.map((iq) => ({ id: iq.questionId, type: iq.question.questionType })),
    });
  }

  for (let i = 0; i < 6; i++) {
    const club = clubs[i % clubs.length];
    const admin = clubAdmins.find((a) => a.clubId === club.id)!;
    const eventDate = new Date(2026, 2, 1 + i * 2, 9, 0);

    const event = await prisma.event.create({
      data: {
        clubId: club.id,
        title: `Klub Event ${i + 1}`,
        eventDate,
        location: clubNames[i % clubNames.length].city,
        eventType: i % 2 === 0 ? "TRAINING" : "RACE",
        createdByUserId: admin.id,
      },
    });

    const eventInstance = await prisma.surveyInstance.create({
      data: {
        surveyTemplateId: eventTemplate.id,
        clubId: club.id,
        name: `Event feedback - ${event.title}`,
        surveyType: SurveyType.EVENT,
        status: SurveyStatus.SCHEDULED,
        eventId: event.id,
        createdByUserId: admin.id,
      },
    });

    const eventTemplateQuestions = await prisma.surveyTemplateQuestion.findMany({
      where: { surveyTemplateId: eventTemplate.id },
      orderBy: { sortOrder: "asc" },
    });

    for (const templateQuestion of eventTemplateQuestions) {
      await prisma.surveyInstanceQuestion.create({
        data: {
          surveyInstanceId: eventInstance.id,
          questionId: templateQuestion.questionId,
          sortOrder: templateQuestion.sortOrder,
          required: templateQuestion.required,
          sourceType: SurveyInstanceQuestionSource.CORE,
        },
      });
    }

    await prisma.scheduledSend.create({
      data: {
        surveyInstanceId: eventInstance.id,
        sendAt: new Date(eventDate.getTime() + 24 * 60 * 60 * 1000),
        status: i < 2 ? ScheduledSendStatus.PROCESSED : ScheduledSendStatus.PENDING,
        triggerType: ScheduledSendTriggerType.EVENT_PLUS_1_DAY,
        processedAt: i < 2 ? new Date(eventDate.getTime() + 24 * 60 * 60 * 1000) : null,
      },
    });
  }

  const totalResponses = await prisma.surveyResponse.count();
  const totalMembers = await prisma.member.count();

  console.log("Seed completed successfully");
  console.log(`Clubs: ${clubs.length}`);
  console.log(`Members: ${totalMembers}`);
  console.log(`Responses: ${totalResponses}`);
  console.log("Demo login: admin@dmu.dk / demo1234 and klub1@dmu.dk / demo1234");
  console.log(`Demo club detail route: /dmu/clubs/${clubs[0].id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
