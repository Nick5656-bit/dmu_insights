import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decryptSession, sessionCookieName, SessionPayload } from "@/lib/session";

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) {
    return null;
  }

  return decryptSession(token);
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
