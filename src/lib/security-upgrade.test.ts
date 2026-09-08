import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import bcrypt from "bcryptjs";
import { loadTestModule } from "./test-module-loader";
import { decryptSession, encryptSession, sessionCookieName } from "./session";

const secret = "isolated-security-upgrade-test-secret-not-for-deployment";

test("session library rejects legacy, expired or altered tokens and accepts versioned sessions", async (t) => {
  const original = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = secret;
  t.after(() => { if (original === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = original; });
  const profile = { userId: "test-admin", name: "Test", email: "admin@example.test", role: "DMU_ADMIN" as const, clubId: null };
  const legacyToken = (exp: number) => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ ...profile, exp })).toString("base64url");
    const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
    return `${header}.${body}.${signature}`;
  };
  assert.equal(await decryptSession(legacyToken(Math.floor(Date.now() / 1000) + 3600)), null);
  assert.equal(await decryptSession(legacyToken(1)), null);
  const { token } = await encryptSession({ ...profile, version: "a".repeat(64) });
  assert.equal((await decryptSession(token))?.role, "DMU_ADMIN");
  const parts = token.split(".");
  parts[1] = Buffer.from(JSON.stringify({ ...profile, userId: "different-user" })).toString("base64url");
  assert.equal(await decryptSession(parts.join(".")), null);
});

test("login keeps both roles, cookie protection, password rejection and rate limiting after upgrades", async (t) => {
  const original = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = secret;
  t.after(() => { if (original === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = original; });
  const password = "Unique-test-password-123";
  const passwordHash = await bcrypt.hash(password, 4);
  let failures = 0;
  let lookups = 0;
  let activeClub = true;
  let role: "DMU_ADMIN" | "CLUB_ADMIN" = "DMU_ADMIN";
  const prisma = {
    loginAttempt: { count: async () => failures, create: async () => ({}), deleteMany: async () => ({ count: 0 }) },
    user: { findUnique: async () => { lookups++; return { id: "test-user", name: "Test", email: "admin@example.test", passwordHash, role, clubId: role === "CLUB_ADMIN" ? "test-club" : null, club: { active: activeClub } }; } },
  };
  const route = loadTestModule<{ POST: (request: Request) => Promise<Response> }>("src/app/api/auth/login/route.ts", {
    "@/lib/prisma": { prisma },
    "@/lib/auth": { getHomePathForRole: (value: string) => value === "DMU_ADMIN" ? "/dmu/dashboard" : "/club/overview" },
  });
  const request = (value: string, email = "admin@example.test", rememberMe = "") => new Request("https://example.test/api/auth/login", {
    method: "POST", body: new URLSearchParams({ email, password: value, rememberMe }),
  });
  for (const value of ["DMU_ADMIN", "CLUB_ADMIN"] as const) {
    role = value;
    const response = await route.POST(request(password));
    assert.equal(new URL(response.headers.get("location")!).pathname, value === "DMU_ADMIN" ? "/dmu/dashboard" : "/club/overview");
    const cookie = response.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=lax/i);
    assert.doesNotMatch(cookie, /Expires=|Max-Age=/i, "normal login uses a browser-session cookie");
    const token = cookie.split(";")[0].slice(`${sessionCookieName}=`.length);
    assert.equal((await decryptSession(token))?.role, value);
  }
  const remembered = await route.POST(request(password, "admin@example.test", "on"));
  const persistentCookie = remembered.headers.get("set-cookie")!;
  assert.match(persistentCookie, /Expires=/i);
  const rememberedToken = persistentCookie.split(";")[0].slice(`${sessionCookieName}=`.length);
  const rememberedSession = await decryptSession(rememberedToken);
  assert.ok(rememberedSession && Math.abs(rememberedSession.exp - Date.now() / 1000 - 30 * 86400) < 3);
  activeClub = false;
  const inactive = await route.POST(request(password));
  assert.match(inactive.headers.get("location")!, /invalid_credentials/);
  assert.equal(inactive.headers.get("set-cookie"), null);
  activeClub = true;
  const rejected = await route.POST(request("wrong-password"));
  assert.match(rejected.headers.get("location")!, /invalid_credentials/);
  assert.equal(rejected.headers.get("set-cookie"), null);
  assert.match((await route.POST(request(password, "invalid"))).headers.get("location")!, /invalid_input/);
  failures = 5;
  const before = lookups;
  assert.match((await route.POST(request(password))).headers.get("location")!, /rate_limited/);
  assert.equal(lookups, before);
});
