import type { MotocrossClass, RespondentAgeGroup, RespondentRole } from "@prisma/client";

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
};

export type MotocrossClassOptionGroup = {
  label: string;
  options: SegmentOption<MotocrossClass>[];
};

export const respondentAgeGroupOptions: SegmentOption<RespondentAgeGroup>[] = [
  { value: "UNDER_18", label: "Under 18 år" },
  { value: "AGE_18_30", label: "18–30 år" },
  { value: "AGE_31_50", label: "31–50 år" },
  { value: "AGE_51_PLUS", label: "51 år eller derover" },
  { value: "PREFER_NOT_TO_SAY", label: "Foretrækker ikke at oplyse" },
];

export const respondentRoleOptions: SegmentOption<RespondentRole>[] = [
  { value: "RIDER", label: "Aktiv kører" },
  { value: "SIDECAR_PASSENGER", label: "Sidevognspassager" },
  { value: "VOLUNTEER", label: "Frivillig" },
  { value: "PARENT_GUARDIAN", label: "Forælder eller pårørende" },
  { value: "COACH_OFFICIAL", label: "Træner eller official" },
  { value: "OTHER", label: "Anden relation til klubben" },
  { value: "PREFER_NOT_TO_SAY", label: "Foretrækker ikke at oplyse" },
];

export const motocrossClassOptionGroups: MotocrossClassOptionGroup[] = [
  {
    label: "Micro",
    options: [
      { value: "MICRO_BEGINNER_LOW_EFFECT", label: "Micro begynder / laveffekt" },
      { value: "MICRO_50", label: "Micro 50" },
      { value: "MICRO_C_65", label: "Micro C 65" },
      { value: "MICRO_B_65", label: "Micro B 65" },
    ],
  },
  {
    label: "Mini",
    options: [
      { value: "MINI_C_65", label: "Mini C 65" },
      { value: "MINI_B_65", label: "Mini B 65" },
      { value: "MINI_C_85", label: "Mini C 85" },
      { value: "MINI_B_85", label: "Mini B 85" },
      { value: "PIGE", label: "Pige" },
      { value: "PIGE_C", label: "Pige C" },
    ],
  },
  {
    label: "Maxi / solo",
    options: [
      { value: "C_125", label: "C 125" },
      { value: "C_MX2", label: "C MX2" },
      { value: "C_MX1", label: "C MX1" },
      { value: "C_MAXI_MIX", label: "C Maxi Mix" },
      { value: "JUNIOR_125", label: "Junior 125" },
      { value: "B_MX2", label: "B MX2" },
      { value: "B_MX1", label: "B MX1" },
      { value: "B_MAXI_MIX", label: "B Maxi Mix" },
      { value: "A_MX2", label: "A MX2" },
      { value: "A_MX1", label: "A MX1" },
      { value: "A_MAXI_MIX", label: "A Maxi Mix" },
      { value: "A_B_MAXI_MIX", label: "A/B Maxi Mix" },
      { value: "A_B_C_MAXI_MIX", label: "A/B/C Maxi Mix" },
      { value: "DAME", label: "Dame" },
      { value: "DAME_C_CUP", label: "Dame C Cup" },
    ],
  },
  {
    label: "Old Boys og veteran",
    options: [
      { value: "OLD_BOYS_C_30", label: "Old Boys C 30+" },
      { value: "OLD_BOYS_B_30", label: "Old Boys B 30+" },
      { value: "OLD_BOYS_A_30", label: "Old Boys A 30+" },
      { value: "OLD_BOYS_B_40", label: "Old Boys B 40+" },
      { value: "OLD_BOYS_A_40", label: "Old Boys A 40+" },
      { value: "VETERAN_55", label: "Veteran 55+" },
    ],
  },
  {
    label: "Classic",
    options: [
      { value: "CLASSIC_PRE_74_UNDER_66", label: "Classic Pre-74, under 66" },
      { value: "CLASSIC_PRE_74_66_PLUS", label: "Classic Pre-74, 66+" },
      { value: "CLASSIC_PRE_74_72_PLUS", label: "Classic Pre-74, 72+" },
      { value: "CLASSIC_TWIN_SHOCK_UNDER_60", label: "Classic Twin Shock, under 60" },
      { value: "CLASSIC_TWIN_SHOCK_60_PLUS", label: "Classic Twin Shock, 60+" },
      { value: "CLASSIC_125_TWIN_SHOCK", label: "Classic 125 cc Twin Shock" },
      { value: "CLASSIC_125_EVO_PRE_96", label: "Classic 125 cc EVO Pre-96" },
      { value: "CLASSIC_EVO_PRE_08_UNDER_50", label: "Classic EVO Pre-08, under 50" },
      { value: "CLASSIC_EVO_PRE_08_50_PLUS", label: "Classic EVO Pre-08, 50+" },
      { value: "CLASSIC_EVO_PRE_96_40_PLUS", label: "Classic EVO Pre-96, 40+" },
      { value: "CLASSIC_EVO_PRE_96_60_PLUS", label: "Classic EVO Pre-96, 60+" },
      { value: "CLASSIC_50CC_PRE_83", label: "Classic 50 cc Pre-83" },
      { value: "CLASSIC_A", label: "Classic A-cykler" },
    ],
  },
  {
    label: "Pitbike og sidevogn",
    options: [
      { value: "PITBIKE_OPEN", label: "Pitbike Open" },
      { value: "PITBIKE_STANDARD_OPEN", label: "Pitbike Standard Open" },
      { value: "SIDEVOGN_OPEN", label: "Sidevogn Open" },
    ],
  },
  {
    label: "Quad",
    options: [
      { value: "QUAD_BEGINNER_50", label: "Quad begynder 50 cc" },
      { value: "QUAD_MICRO_100", label: "Quad Micro 100 cc" },
      { value: "QUAD_MINI_100_VARIO", label: "Quad Mini 100 cc Vario" },
      { value: "QUAD_MINI_B_C_250_GEAR_MIX_OPEN", label: "Quad Mini B/C 250 cc Gear Mix Open" },
      { value: "QUAD_MAXI_C_450_500_OPEN", label: "Quad Maxi C 450/500 cc Open" },
      { value: "QUAD_MAXI_A_B_500_OPEN", label: "Quad Maxi A/B 500 cc Open" },
      { value: "QUAD_OLD_BOYS_40_OPEN", label: "Quad Old Boys 40+ Open" },
    ],
  },
  {
    label: "Andet",
    options: [
      { value: "NO_FIXED_CLASS", label: "Jeg kører ikke løb eller har ikke en fast klasse" },
      { value: "PREFER_NOT_TO_SAY", label: "Foretrækker ikke at oplyse" },
    ],
  },
];

export const motocrossClassOptions = motocrossClassOptionGroups.flatMap((group) => group.options);

export const dashboardRespondentAgeGroupOptions: SegmentOption<RespondentAgeGroup>[] = [
  ...respondentAgeGroupOptions,
  { value: "NOT_REPORTED", label: "Ikke oplyst (tidligere svar)" },
];

export const dashboardRespondentRoleOptions: SegmentOption<RespondentRole>[] = [
  ...respondentRoleOptions,
  { value: "NOT_REPORTED", label: "Ikke oplyst (tidligere svar)" },
];

export const dashboardMotocrossClassOptions: SegmentOption<MotocrossClass>[] = [
  ...motocrossClassOptions,
  { value: "NOT_APPLICABLE", label: "Ikke relevant (ikke aktiv på banen)" },
  { value: "NOT_REPORTED", label: "Ikke oplyst (tidligere svar)" },
];

const respondentAgeGroupValues = new Set<RespondentAgeGroup>([
  ...respondentAgeGroupOptions.map((option) => option.value),
  "NOT_REPORTED",
]);
const respondentRoleValues = new Set<RespondentRole>([
  ...respondentRoleOptions.map((option) => option.value),
  "NOT_REPORTED",
]);
const motocrossClassValues = new Set<MotocrossClass>([
  ...motocrossClassOptions.map((option) => option.value),
  "NOT_APPLICABLE",
  "NOT_REPORTED",
]);

export function isRespondentAgeGroup(value: string): value is RespondentAgeGroup {
  return respondentAgeGroupValues.has(value as RespondentAgeGroup);
}

export function isRespondentRole(value: string): value is RespondentRole {
  return respondentRoleValues.has(value as RespondentRole);
}

export function isMotocrossClass(value: string): value is MotocrossClass {
  return motocrossClassValues.has(value as MotocrossClass);
}

export function isSelectableMotocrossClass(value: string): value is MotocrossClass {
  return motocrossClassOptions.some((option) => option.value === value);
}

export function roleNeedsMotocrossClass(role: RespondentRole) {
  return role === "RIDER" || role === "SIDECAR_PASSENGER";
}
