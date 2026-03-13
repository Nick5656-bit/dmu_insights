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

export async function POST(request: Request) {
  try {
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
      return NextResponse.redirect(new URL("/login?error=invalid_credentials", request.url));
    }

    const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!isValid) {
      return NextResponse.redirect(new URL("/login?error=invalid_credentials", request.url));
    }

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
