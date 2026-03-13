import { NextRequest, NextResponse } from "next/server";
import { decryptSession, sessionCookieName } from "@/lib/session";

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
    return NextResponse.redirect(new URL("/dmu/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dmu/:path*", "/club/:path*"],
};
