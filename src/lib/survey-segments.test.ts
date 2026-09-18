import assert from "node:assert/strict";
import test from "node:test";
import { MotocrossClass } from "@prisma/client";
import {
  isSelectableMotocrossClass,
  motocrossClassOptions,
  roleNeedsMotocrossClass,
  respondentRoleOptions,
  dashboardRespondentRoleOptions,
  isRespondentRole,
} from "@/lib/survey-segments";

test("new role choices omit passengers while historical response filtering remains available", () => {
  assert.equal(respondentRoleOptions.some(option => option.value === "SIDECAR_PASSENGER"), false);
  assert.equal(dashboardRespondentRoleOptions.some(option => option.value === "SIDECAR_PASSENGER"), true);
  assert.equal(isRespondentRole("SIDECAR_PASSENGER"), true);
});

test("kun aktive deltagere på banen skal vælge motocrossklasse", () => {
  assert.equal(roleNeedsMotocrossClass("RIDER"), true);
  assert.equal(roleNeedsMotocrossClass("SIDECAR_PASSENGER"), true);
  assert.equal(roleNeedsMotocrossClass("VOLUNTEER"), false);
  assert.equal(roleNeedsMotocrossClass("PARENT_GUARDIAN"), false);
});

test("den centralt vedligeholdte klasseliste dækker pilotens centrale MX-klasser", () => {
  const classes = new Set(motocrossClassOptions.map((option) => option.value));

  for (const classValue of [
    "MINI_C_65",
    "C_MAXI_MIX",
    "OLD_BOYS_B_40",
    "VETERAN_55",
    "CLASSIC_TWIN_SHOCK_60_PLUS",
    "QUAD_MAXI_C_450_500_OPEN",
  ]) {
    assert.equal(classes.has(classValue as MotocrossClass), true);
    assert.equal(isSelectableMotocrossClass(classValue), true);
  }

  assert.equal(isSelectableMotocrossClass("NOT_REPORTED"), false);
});
