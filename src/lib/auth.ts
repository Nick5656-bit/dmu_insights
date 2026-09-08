import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decryptSession, sessionCookieName, SessionPayload } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sessionVersion } from "@/lib/session-version";

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) {
    return null;
  }

  const session = await decryptSession(token);
  if (!session) return null;
  // Do not cache across requests: account removal, password changes and club
  // deactivation must take effect on the next protected request/server action.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, passwordHash: true, role: true,
      clubId: true, club: { select: { active: true } } },
  });
  if (!user || session.version !== sessionVersion(user) ||
      (user.role === "CLUB_ADMIN" && (!user.clubId || !user.club?.active))) return null;
  return { ...session, name: user.name, email: user.email, role: user.role, clubId: user.clubId };
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function requireRole(role: SessionPayload["role"]) {
  const session = await requireSession();
  if (session.role !== role) {
    redirect(getHomePathForRole(session.role));
  }
  return session;
}

export function getHomePathForRole(role: SessionPayload["role"]) {
  if (role === "DMU_ADMIN") {
    return "/dmu/dashboard";
  }
  return "/club/overview";
}
