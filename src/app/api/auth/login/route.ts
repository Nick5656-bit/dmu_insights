import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getHomePathForRole } from "@/lib/auth";
import { encryptSession, sessionCookieName } from "@/lib/session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

async function isRateLimited(ip: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

  const recentFailures = await prisma.loginAttempt.count({
    where: {
      ip,
      success: false,
      createdAt: { gte: windowStart },
    },
  });

  return recentFailures >= MAX_ATTEMPTS;
}

async function recordAttempt(ip: string, success: boolean) {
  await prisma.loginAttempt.create({ data: { ip, success } });

  // Ryd gamle forsøg (ældre end 24 timer) for at holde tabellen lille
  await prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
}

export async function POST(request: Request) {
  const ip = getClientIp(request);

  try {
    if (await isRateLimited(ip)) {
      return NextResponse.redirect(new URL("/login?error=rate_limited", request.url));
    }

    const formData = await request.formData();
    const parsed = loginSchema.safeParse({
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      password: String(formData.get("password") ?? ""),
    });

    if (!parsed.success) {
      return NextResponse.redirect(new URL("/login?error=invalid_input", request.url));
    }

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user) {
      await recordAttempt(ip, false);
      return NextResponse.redirect(new URL("/login?error=invalid_credentials", request.url));
    }

    const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!isValid) {
      await recordAttempt(ip, false);
      return NextResponse.redirect(new URL("/login?error=invalid_credentials", request.url));
    }

    // Succesfuldt login – nulstil forsøg for denne IP
    await recordAttempt(ip, true);

    const { token, expiresAt } = await encryptSession({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      clubId: user.clubId,
    });

    const response = NextResponse.redirect(new URL(getHomePathForRole(user.role), request.url));
    response.cookies.set(sessionCookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(expiresAt * 1000),
    });

    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=server_error", request.url));
  }
}
