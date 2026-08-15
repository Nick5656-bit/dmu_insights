import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const dmuNavItems = [
  { href: "/dmu/dashboard", label: "Dashboard", icon: "dashboard" as const },
  {
    href: "/dmu/questions",
    label: "Spørgsmål & skabeloner",
    activePrefixes: ["/dmu/questions", "/dmu/templates"],
    icon: "content" as const,
  },
  { href: "/dmu/send", label: "Udsend spørgeskema", icon: "deliveries" as const },
  {
    href: "/dmu/calendar",
    label: "Kalender",
    activePrefixes: ["/dmu/calendar", "/dmu/events"],
    icon: "events" as const,
  },
  {
    href: "/dmu/settings",
    label: "Indstillinger",
    activePrefixes: ["/dmu/settings", "/dmu/club-users", "/dmu/outbox", "/dmu/mail-log", "/dmu/members"],
    icon: "users" as const,
  },
];

export default async function DmuLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("DMU_ADMIN");

  return (
    <AppShell areaLabel="DMU administrator" userName={session.name} navItems={dmuNavItems}>
      {children}
    </AppShell>
  );
}
