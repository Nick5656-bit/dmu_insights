import { SignJWT, jwtVerify } from "jose";

export type SessionPayload = {
  userId: string;
  name: string;
  email: string;
  role: "DMU_ADMIN" | "CLUB_ADMIN";
  clubId: string | null;
  version: string;
  exp: number;
};

const SESSION_COOKIE_NAME = "dmu_session";

const getSessionSecret = () => {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error("SESSION_SECRET is not configured.");
  }
  return new TextEncoder().encode(value);
};

export const sessionCookieName = SESSION_COOKIE_NAME;

export async function encryptSession(payload: Omit<SessionPayload, "exp">, rememberMe = false) {
  const expiresAt = Math.floor(Date.now() / 1000) + (rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 12);
  const token = await new SignJWT({ ...payload, exp: expiresAt })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getSessionSecret());

  return { token, expiresAt };
}

export async function decryptSession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), {
      algorithms: ["HS256"],
    });

    if (typeof payload.userId !== "string" || !payload.userId ||
        typeof payload.name !== "string" || typeof payload.email !== "string" ||
        (payload.role !== "DMU_ADMIN" && payload.role !== "CLUB_ADMIN") ||
        (payload.clubId !== null && typeof payload.clubId !== "string") ||
        typeof payload.version !== "string" || !/^[a-f0-9]{64}$/.test(payload.version) ||
        typeof payload.exp !== "number") return null;

    return {
      userId: String(payload.userId),
      name: String(payload.name),
      email: String(payload.email),
      role: payload.role as SessionPayload["role"],
      clubId: payload.clubId ? String(payload.clubId) : null,
      version: payload.version,
      exp: Number(payload.exp),
    };
  } catch {
    return null;
  }
}
