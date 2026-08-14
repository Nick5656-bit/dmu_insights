import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const clubNavItems = [
  { href: "/club/overview", label: "Overblik", icon: "overview" as const },
  { href: "/club/dashboard", label: "Dashboard", icon: "dashboard" as const },
  { href: "/club/events", label: "Arrangementer", icon: "events" as const },
  // PILOT: Spørgeskemaer, Spørgsmål og Udsendelser er skjult i pilot-versionen.
  // Fjern kommentaren nedenfor for at aktivere dem igen:
  // { href: "/club/surveys", label: "Spørgeskemaer", icon: "surveys" as const },
  // { href: "/club/questions", label: "Spørgsmål", icon: "questions" as const },
  // { href: "/club/outbox", label: "Udsendelser", activePrefixes: ["/club/outbox", "/club/mail-log"], icon: "deliveries" as const },
];

export default async function ClubLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("CLUB_ADMIN");

  return (
    <AppShell areaLabel="Klubadministrator" userName={session.name} navItems={clubNavItems}>
      {children}
    </AppShell>
  );
}
