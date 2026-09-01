import type { NavIconName } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { AppNav } from "@/components/app-nav";
import { DmuLogo } from "@/components/dmu-logo";

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

type AppShellProps = {
  areaLabel: string;
  userName: string;
  navItems: NavItem[];
  children: React.ReactNode;
};

export function AppShell({ areaLabel, userName, navItems, children }: AppShellProps) {
  const firstName = userName.split(" ")[0] ?? userName;

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex w-full max-w-[1500px] gap-4 px-3 py-3 md:px-4 md:py-4">
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-[296px] shrink-0 flex-col rounded-[2rem] border border-sidebar-border bg-sidebar p-4 shadow-[0_30px_60px_-42px_rgba(21,37,77,0.45)] backdrop-blur lg:flex">
          <div className="rounded-[1.6rem] bg-[linear-gradient(160deg,rgba(16,36,77,0.98),rgba(33,64,122,0.92))] p-4 text-primary-foreground">
            <DmuLogo compact size="sm" surface="card" variant="insights" />
            <div className="mt-4 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-foreground/70">{areaLabel}</p>
              <p className="text-xl font-bold leading-none">{firstName}</p>
            </div>
          </div>

          <div className="mt-5 flex-1 rounded-[1.6rem] border border-sidebar-border/90 bg-background/78 p-3">
            <div className="mb-3 px-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Navigation</p>
            </div>
            <AppNav navItems={navItems} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-3 z-30 rounded-[1.8rem] border border-border/75 bg-background/88 px-4 py-2.5 shadow-[0_24px_50px_-38px_rgba(21,37,77,0.42)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{areaLabel}</p>
                <h1 className="mt-1 text-base font-bold leading-none text-foreground">DMU Medlemsfeedback</h1>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="hidden rounded-full border border-border/80 bg-muted/55 px-4 py-1.5 text-sm text-muted-foreground sm:inline-flex">
                  {userName}
                </span>
                <form action="/api/auth/logout" method="post">
                  <Button variant="outline" size="default" type="submit">
                    Log ud
                  </Button>
                </form>
              </div>
            </div>
          </header>

          <div className="mt-3 rounded-[1.5rem] border border-border/70 bg-background/75 p-2 backdrop-blur lg:hidden">
            <AppNav navItems={navItems} variant="topbar" />
          </div>

          <main className="mt-4 min-w-0 space-y-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
