import { Button } from "@/components/ui/button";
import { AppNav } from "@/components/app-nav";
import { DmuLogo } from "@/components/dmu-logo";

type NavItem = {
  href: string;
  label: string;
};

type AppShellProps = {
  areaLabel: string;
  userName: string;
  navItems: NavItem[];
  children: React.ReactNode;
};

export function AppShell({ areaLabel, userName, navItems, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 via-background to-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-5">
            <DmuLogo compact />
            <div className="hidden sm:block">
              <p className="text-sm uppercase tracking-wide text-muted-foreground">{areaLabel}</p>
              <h1 className="text-lg font-semibold">DMU Medlemsfeedback</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs text-muted-foreground">{userName}</span>
            <form action="/api/auth/logout" method="post">
              <Button variant="outline" size="sm" type="submit">
                Log ud
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl items-start gap-6 px-4 py-6">
        <aside className="hidden w-[260px] shrink-0 rounded-2xl border border-border/70 bg-background/95 p-3 shadow-sm md:sticky md:top-[5.25rem] md:block md:max-h-[calc(100vh-6rem)] md:overflow-y-auto">
          <div className="mb-3 px-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Menu</p>
          </div>
          <AppNav navItems={navItems} />
        </aside>
        <main className="min-w-0 flex-1 space-y-6">{children}</main>
      </div>
    </div>
  );
}
