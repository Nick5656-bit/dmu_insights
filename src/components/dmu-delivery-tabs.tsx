"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dmu/settings/manual-send", label: "Manuel udsendelse" },
  { href: "/dmu/settings/sends", label: "Tidligere udsendelser" },
  { href: "/dmu/settings/mail-log", label: "Mailhistorik" },
];

type DmuDeliveryTabsProps = {
  variant?: "light" | "dark";
};

export function DmuDeliveryTabs({ variant = "light" }: DmuDeliveryTabsProps) {
  const pathname = usePathname();

  return (
    <div className={cn("inline-flex rounded-full p-1", variant === "dark" ? "border border-white/15 bg-white/10" : "border border-border/70 bg-muted/25")}>
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-all",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : variant === "dark"
                  ? "text-white/85 hover:text-white"
                  : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
