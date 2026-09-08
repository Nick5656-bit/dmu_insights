import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";

// Retained for a future release, but not an environment toggle: the legacy
// test-send implementation must be replaced before these features are enabled.
export async function requireLegacyClubRole(role: "CLUB_ADMIN") {
  const session = await requireRole(role);
  notFound();
  return session;
}
