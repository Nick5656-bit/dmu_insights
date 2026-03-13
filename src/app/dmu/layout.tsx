import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const dmuNavItems = [
  { href: "/dmu/dashboard", label: "Overblik" },
  { href: "/dmu/questions", label: "Standardspørgsmål" },
  { href: "/dmu/templates", label: "Spørgeskema-skabeloner" },
  { href: "/dmu/events", label: "Arrangementer" },
  { href: "/dmu/surveys", label: "Spørgeskemaer" },
  { href: "/dmu/outbox", label: "Udsendelser" },
  { href: "/dmu/mail-log", label: "Mail-log" },
  { href: "/dmu/club-users", label: "Klubbrugere" },
];

export default async function DmuLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("DMU_ADMIN");

  return (
    <AppShell areaLabel="DMU administrator" userName={session.name} navItems={dmuNavItems}>
      {children}
    </AppShell>
  );
}
