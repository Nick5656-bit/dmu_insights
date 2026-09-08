import assert from "node:assert/strict";
import test from "node:test";
import { SignJWT } from "jose";
import { encryptSession, decryptSession } from "./session";
import { sessionVersion } from "./session-version";
import { passwordSchema } from "./pilot-setup";
import { findElements, loadTestModule } from "./test-module-loader";
import type * as Auth from "./auth";

test("sessions check current account, password, role, membership and active club on every request", async (t) => {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "isolated-session-control-test-only";
  t.after(() => { if (previous === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = previous; });
  const original = { id: "user", name: "Admin", email: "admin@example.test", passwordHash: "hash-one",
    role: "CLUB_ADMIN" as const, clubId: "club-a", club: { active: true } };
  let user: (Omit<typeof original, "role" | "clubId"> & { role: string; clubId: string | null }) | null = { ...original };
  let unavailable = false;
  let token: string | undefined;
  const auth = loadTestModule<typeof Auth>("src/lib/auth.ts", {
    "next/headers": { cookies: async () => ({ get: () => token ? { value: token } : undefined }) },
    "next/navigation": { redirect: (url: string) => { throw new Error(`redirect:${url}`); } },
    "@/lib/prisma": { prisma: { user: { findUnique: async () => { if (unavailable) throw new Error("offline"); return user; } } } },
  });
  assert.equal(await auth.getSession(), null);
  const profile = { userId: original.id, name: original.name, email: original.email,
    role: original.role, clubId: original.clubId, version: sessionVersion(original) };
  for (const remember of [false, true]) {
    const issued = await encryptSession(profile, remember);
    token = issued.token;
    const remaining = issued.expiresAt - Math.floor(Date.now() / 1000);
    assert.ok(Math.abs(remaining - (remember ? 30 * 86400 : 12 * 3600)) < 3);
    user = { ...original };
    assert.equal((await auth.getSession())?.userId, "user");
    user = null;
    assert.equal(await auth.getSession(), null, "deleted user");
    for (const change of [{ passwordHash: "hash-two" }, { clubId: "club-b" }, { clubId: null }, { role: "DMU_ADMIN" },
      { email: "new@example.test" }, { club: { active: false } }]) {
      user = { ...original, ...change };
      assert.equal(await auth.getSession(), null);
    }
    user = { ...original, name: "Updated name" };
    assert.equal((await auth.getSession())?.name, "Updated name");
    unavailable = true;
    await assert.rejects(auth.getSession(), /offline/, "database failure must not authorize from JWT alone");
    unavailable = false;
  }
  assert.notEqual(sessionVersion(original), sessionVersion({ ...original, role: "DMU_ADMIN" }));
  // Even a correctly signed but malformed token must fail closed.
  const malformed = await new SignJWT({ ...profile, role: "UNKNOWN" }).setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h").sign(new TextEncoder().encode(process.env.SESSION_SECRET));
  assert.equal(await decryptSession(malformed), null);
});

test("one password policy rejects short or bcrypt-truncated passwords", () => {
  assert.equal(passwordSchema.safeParse("a".repeat(11)).success, false);
  assert.equal(passwordSchema.safeParse("a".repeat(12)).success, true);
  assert.equal(passwordSchema.safeParse("a".repeat(72)).success, true);
  assert.equal(passwordSchema.safeParse("a".repeat(73)).success, false);
  assert.equal(passwordSchema.safeParse("æ".repeat(36)).success, true);
  assert.equal(passwordSchema.safeParse("æ".repeat(37)).success, false);
});

test("actual club-user edit action enforces shared password policy; blank preserves password", async () => {
  const Widget = () => null;
  const changes: Record<string, unknown>[] = [];
  const target = { id: "club-user", name: "Club admin", email: "club@example.test", role: "CLUB_ADMIN" };
  const page = loadTestModule<{ default: (props: { searchParams: Promise<object> }) => Promise<unknown> }>("src/app/dmu/club-users/page.tsx", {
    "@/lib/auth": { requireRole: async () => ({ role: "DMU_ADMIN" }) },
    "@/lib/prisma": { prisma: {
      club: { findMany: async () => [{ id: "club-a", name: "Club A", users: [target] }] },
      user: { findUnique: async () => target, update: async ({ data }: { data: Record<string, unknown> }) => { changes.push(data); return target; } },
    } },
    "next/navigation": { redirect: (url: string) => { throw new Error(url); } },
    "next/cache": { revalidatePath() {} },
    "bcryptjs": { hash: async (password: string) => `hashed:${password}` },
    "@/components/edit-club-user-button": { EditClubUserButton: Widget },
    "@/components/delete-club-user-button": { DeleteClubUserButton: () => null },
    "@/components/submit-button": { SubmitButton: () => null },
  });
  const tree = await page.default({ searchParams: Promise.resolve({}) });
  const action = findElements(tree, Widget)[0].props.action as (data: FormData) => Promise<void>;
  const form = (password: string, email = target.email) => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ userId: target.id, name: target.name, email, password })) data.set(key, value);
    return data;
  };
  for (const password of ["123456", "a".repeat(11), "æ".repeat(37), "a".repeat(73)]) {
    await assert.rejects(action(form(password)), /invalid_edit_password/);
  }
  await assert.rejects(action(form("", "not-an-email")), /invalid_edit_input/);
  assert.equal(changes.length, 0);
  await assert.rejects(action(form("")), /success=updated/);
  assert.equal(Object.hasOwn(changes[0], "passwordHash"), false);
  await assert.rejects(action(form("a".repeat(12))), /success=updated/);
  assert.equal(changes[1].passwordHash, `hashed:${"a".repeat(12)}`);
});
