import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const dmuNavItems = [
  { href: "/dmu/overview", label: "Overblik", icon: "overview" as const },
  { href: "/dmu/dashboard", label: "Dashboard", icon: "dashboard" as const },
  {
    href: "/dmu/questions",
    label: "Spørgsmål & skabeloner",
    activePrefixes: ["/dmu/questions", "/dmu/templates"],
    icon: "content" as const,
  },
  { href: "/dmu/surveys", label: "Spørgeskemaer", icon: "surveys" as const },
  { href: "/dmu/events", label: "Arrangementer", icon: "events" as const },
  {
    href: "/dmu/outbox",
    label: "Udsendelser",
    activePrefixes: ["/dmu/outbox", "/dmu/mail-log"],
    icon: "deliveries" as const,
  },
  { href: "/dmu/club-users", label: "Klubbrugere", icon: "users" as const },
  { href: "/dmu/members", label: "Medlemmer", icon: "users" as const },
];

export default async function DmuLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("DMU_ADMIN");

  return (
    <AppShell areaLabel="DMU administrator" userName={session.name} navItems={dmuNavItems}>
      {children}
    </AppShell>
  );
}
