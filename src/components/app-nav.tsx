"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, ClipboardList, Files, House, MessageSquare, Send, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavIconName = "overview" | "dashboard" | "content" | "surveys" | "questions" | "events" | "deliveries" | "users";

type NavItem = {
  href: string;
  label: string;
  activePrefixes?: string[];
  icon?: NavIconName;
  children?: Array<{
    href: string;
    label: string;
  }>;
};

type AppNavProps = {
  navItems: NavItem[];
  variant?: "sidebar" | "topbar";
};

export function AppNav({ navItems, variant = "sidebar" }: AppNavProps) {
  const pathname = usePathname();
  const iconMap: Record<NavIconName, LucideIcon> = {
    overview: House,
    dashboard: BarChart3,
    content: Files,
    surveys: ClipboardList,
    questions: MessageSquare,
    events: CalendarDays,
    deliveries: Send,
    users: Users,
  };

  return (
    <nav className={variant === "sidebar" ? "space-y-1.5" : "flex gap-2 overflow-x-auto pb-1"}>
      {navItems.map((item) => {
        const activePrefixes = item.activePrefixes ?? [item.href];
        const isActive = activePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
        const Icon = item.icon ? iconMap[item.icon] : null;

        return (
          <div key={item.href} className={variant === "topbar" ? "flex shrink-0 items-center gap-1.5" : ""}>
            <Link
              href={item.href}
              className={cn(
                variant === "sidebar"
                  ? "block rounded-2xl px-4 py-3 text-sm font-medium transition-all"
                  : "inline-flex shrink-0 items-center rounded-full px-4 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-primary text-primary-foreground shadow-[0_14px_28px_-20px_rgba(21,37,77,0.8)]"
                  : variant === "sidebar"
                    ? "text-foreground hover:bg-muted/85"
                    : "border border-border/80 bg-background/80 text-muted-foreground hover:bg-muted/90 hover:text-foreground"
              )}
            >
              <span className={cn("flex items-center gap-3", variant === "topbar" ? "gap-2.5" : "")}>
                {Icon ? <Icon className={cn("shrink-0", variant === "sidebar" ? "h-4 w-4" : "h-3.5 w-3.5")} /> : null}
                <span>{item.label}</span>
              </span>
            </Link>

            {isActive && item.children && item.children.length > 0 ? (
              <div
                className={cn(
                  variant === "sidebar"
                    ? "ml-7 mt-1 space-y-1 border-l border-border/70 pl-3"
                    : "flex shrink-0 items-center gap-1.5"
                )}
              >
                {item.children.map((child) => {
                  const isChildActive = pathname === child.href || pathname.startsWith(`${child.href}/`);

                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={cn(
                        variant === "sidebar"
                          ? "block rounded-xl px-3 py-2 text-sm font-medium transition-colors"
                          : "inline-flex items-center rounded-full border px-3 py-2 text-sm font-medium transition-colors",
                        isChildActive
                          ? "bg-primary/10 text-primary"
                          : variant === "sidebar"
                            ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                            : "border-border/80 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
