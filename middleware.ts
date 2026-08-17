import { NextRequest, NextResponse } from "next/server";
import { decryptSession, sessionCookieName } from "@/lib/session";

const clubPilotPaths = ["/club/overview", "/club/dashboard", "/club/events"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(sessionCookieName)?.value;

  if (!pathname.startsWith("/dmu") && !pathname.startsWith("/club")) {
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const session = await decryptSession(token);
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname.startsWith("/dmu") && session.role !== "DMU_ADMIN") {
    return NextResponse.redirect(new URL("/club/overview", request.url));
  }

  if (pathname.startsWith("/club") && session.role !== "CLUB_ADMIN") {
    return NextResponse.redirect(new URL("/dmu/overview", request.url));
  }

  // PILOT: hiding navigation is not access control. Only these club pages are
  // approved for the pilot, so direct URLs to legacy features are blocked too.
  if (
    pathname.startsWith("/club") &&
    session.role === "CLUB_ADMIN" &&
    !clubPilotPaths.some((allowedPath) => pathname === allowedPath || pathname.startsWith(`${allowedPath}/`))
  ) {
    return NextResponse.redirect(new URL("/club/overview", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dmu/:path*", "/club/:path*"],
};
