import assert from "node:assert/strict";
import test from "node:test";
import { findElements, loadTestModule } from "./test-module-loader";
import type * as Password from "../components/password-input";

test("password visibility is opt-in, reversible and does not submit or change input constraints", () => {
  let visible = false;
  const { PasswordInput } = loadTestModule<typeof Password>("src/components/password-input.tsx", {
    react: { useState: () => [visible, (next: boolean) => { visible = next; }] },
  });
  const props = { id: "new-password", name: "password", required: true, minLength: 12, maxLength: 72, autoComplete: "new-password", className: "px-3 py-2", defaultValue: "fixture-password" };
  for (const expected of ["password", "text", "password"]) {
    const tree = PasswordInput(props);
    const input = findElements(tree, "input")[0];
    const button = findElements(tree, "button")[0];
    assert.equal(input.props.type, expected);
    for (const key of ["id", "name", "required", "minLength", "maxLength", "autoComplete", "defaultValue"] as const) assert.equal(input.props[key], props[key]);
    assert.match(String(input.props.className), /pr-16/);
    assert.equal(button.props.type, "button");
    assert.equal(button.props["aria-pressed"], expected === "text");
    assert.equal(button.props["aria-label"], expected === "text" ? "Skjul adgangskode" : "Vis adgangskode");
    (button.props.onClick as () => void)();
  }
  const disabled = PasswordInput({ ...props, disabled: true });
  assert.equal(findElements(disabled, "input")[0].props.disabled, true);
  assert.equal(findElements(disabled, "button")[0].props.disabled, true);
});

test("pilot setup omits the readiness checklist but retains account provisioning and access guard", async () => {
  let authorized = false;
  const Form = () => null;
  const { default: page } = loadTestModule<{ default: () => Promise<unknown> }>("src/app/dmu/settings/pilot/page.tsx", {
    "@/lib/auth": { requireRole: async (role: string) => { assert.equal(role, "DMU_ADMIN"); authorized = true; } },
    "@/lib/prisma": { prisma: { club: { findMany: async () => [] }, user: { findMany: async () => [] } } },
    "@/components/pilot-setup-form": { PilotSetupForm: Form },
    "./actions": { createPersonalDmuAdmin: () => {}, createPilotClub: () => {} },
    "next/link": () => null,
  });
  const tree = await page();
  assert.equal(authorized, true);
  const headings = findElements(tree, "h2").map(node => node.props.children);
  assert.ok(!headings.includes("Kontrol før rigtige deltagere"));
  assert.ok(headings.includes("Opret klub og klubadministrator"));
  assert.ok(headings.includes("Personlig DMU-administrator"));
  assert.equal(findElements(tree, Form).length, 2);
});
