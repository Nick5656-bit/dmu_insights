import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const clubNavItems = [
  { href: "/club/overview", label: "Overblik" },
  { href: "/club/dashboard", label: "Dashboard" },
  { href: "/club/surveys", label: "Spørgeskemaer" },
  { href: "/club/questions", label: "Spørgsmål" },
  { href: "/club/events", label: "Arrangementer" },
  { href: "/club/outbox", label: "Udsendelser" },
  { href: "/club/mail-log", label: "Mail-log" },
  { href: "/club/surveys/latest", label: "Seneste spørgeskema" },
];

export default async function ClubLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("CLUB_ADMIN");

  return (
    <AppShell areaLabel="Klubadministrator" userName={session.name} navItems={clubNavItems}>
      {children}
    </AppShell>
  );
}
