-- Segmentdata indsamles på den enkelte besvarelse og er ikke knyttet til
-- medlemsprofilen. IF NOT EXISTS-guarderne gør migrationen sikker for den
-- allerede synkroniserede pilotdatabase.
DO $$ BEGIN
  CREATE TYPE "RespondentAgeGroup" AS ENUM ('UNDER_18', 'AGE_18_30', 'AGE_31_50', 'AGE_51_PLUS', 'PREFER_NOT_TO_SAY', 'NOT_REPORTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RespondentRole" AS ENUM ('RIDER', 'SIDECAR_PASSENGER', 'VOLUNTEER', 'PARENT_GUARDIAN', 'COACH_OFFICIAL', 'OTHER', 'PREFER_NOT_TO_SAY', 'NOT_REPORTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MotocrossClass" AS ENUM (
    'MICRO_BEGINNER_LOW_EFFECT', 'MICRO_50', 'MICRO_C_65', 'MICRO_B_65',
    'MINI_C_65', 'MINI_B_65', 'MINI_C_85', 'MINI_B_85', 'PIGE', 'PIGE_C',
    'C_125', 'C_MX2', 'C_MX1', 'C_MAXI_MIX', 'JUNIOR_125',
    'B_MX2', 'B_MX1', 'B_MAXI_MIX', 'A_MX2', 'A_MX1', 'A_MAXI_MIX',
    'A_B_MAXI_MIX', 'A_B_C_MAXI_MIX', 'DAME', 'DAME_C_CUP',
    'OLD_BOYS_C_30', 'OLD_BOYS_B_30', 'OLD_BOYS_A_30', 'OLD_BOYS_B_40',
    'OLD_BOYS_A_40', 'VETERAN_55', 'CLASSIC_PRE_74_UNDER_66',
    'CLASSIC_PRE_74_66_PLUS', 'CLASSIC_PRE_74_72_PLUS',
    'CLASSIC_TWIN_SHOCK_UNDER_60', 'CLASSIC_TWIN_SHOCK_60_PLUS',
    'CLASSIC_125_TWIN_SHOCK', 'CLASSIC_125_EVO_PRE_96',
    'CLASSIC_EVO_PRE_08_UNDER_50', 'CLASSIC_EVO_PRE_08_50_PLUS',
    'CLASSIC_EVO_PRE_96_40_PLUS', 'CLASSIC_EVO_PRE_96_60_PLUS',
    'CLASSIC_50CC_PRE_83', 'CLASSIC_A', 'PITBIKE_OPEN',
    'PITBIKE_STANDARD_OPEN', 'SIDEVOGN_OPEN', 'QUAD_BEGINNER_50',
    'QUAD_MICRO_100', 'QUAD_MINI_100_VARIO',
    'QUAD_MINI_B_C_250_GEAR_MIX_OPEN', 'QUAD_MAXI_C_450_500_OPEN',
    'QUAD_MAXI_A_B_500_OPEN', 'QUAD_OLD_BOYS_40_OPEN', 'NO_FIXED_CLASS',
    'PREFER_NOT_TO_SAY', 'NOT_APPLICABLE', 'NOT_REPORTED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SurveyResponse"
  ADD COLUMN IF NOT EXISTS "respondentAgeGroup" "RespondentAgeGroup" NOT NULL DEFAULT 'NOT_REPORTED',
  ADD COLUMN IF NOT EXISTS "respondentRole" "RespondentRole" NOT NULL DEFAULT 'NOT_REPORTED',
  ADD COLUMN IF NOT EXISTS "motocrossClass" "MotocrossClass" NOT NULL DEFAULT 'NOT_REPORTED';

ALTER TABLE "SurveyResponse" ALTER COLUMN "ageGroup" DROP NOT NULL;
ALTER TABLE "SurveyResponse" ALTER COLUMN "raceClass" DROP NOT NULL;
ALTER TABLE "SurveyResponse" ALTER COLUMN "memberRole" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "SurveyResponse_clubId_respondentAgeGroup_idx"
  ON "SurveyResponse"("clubId", "respondentAgeGroup");
CREATE INDEX IF NOT EXISTS "SurveyResponse_clubId_respondentRole_idx"
  ON "SurveyResponse"("clubId", "respondentRole");
CREATE INDEX IF NOT EXISTS "SurveyResponse_clubId_motocrossClass_idx"
  ON "SurveyResponse"("clubId", "motocrossClass");
