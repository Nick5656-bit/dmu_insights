"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dmu/questions", label: "Standardspørgsmål" },
  { href: "/dmu/templates", label: "Skabeloner" },
];

type DmuContentTabsProps = {
  variant?: "light" | "dark";
};

export function DmuContentTabs({ variant = "light" }: DmuContentTabsProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-all",
              isActive
                ? "bg-primary text-primary-foreground shadow-[0_14px_28px_-20px_rgba(21,37,77,0.8)]"
                : variant === "dark"
                  ? "border border-white/15 bg-white/10 text-white/85 hover:bg-white/16 hover:text-white"
                  : "border border-border/80 bg-background/80 text-muted-foreground hover:bg-muted/90 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
