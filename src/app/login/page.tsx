import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DmuLogo } from "@/components/dmu-logo";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

const errorMessages: Record<string, string> = {
  invalid_credentials: "Forkert e-mail eller adgangskode.",
  invalid_input: "Udfyld både e-mail og adgangskode.",
  server_error: "Der opstod en fejl. Prøv igen.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = params.error ? errorMessages[params.error] : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 via-background to-background p-4">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-6xl gap-6 rounded-3xl border bg-background p-6 shadow-sm lg:grid-cols-[1fr_430px]">
        <section className="rounded-2xl border bg-muted/10 p-8">
          <span className="inline-flex rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">Universitetsprototype · DMU</span>
          <DmuLogo />
          <h1 className="mt-8 text-3xl font-semibold tracking-tight">Medlemsfeedback for Danmarks Motor Union</h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Denne prototype understøtter løbende medlemsfeedback via klubberne med anonym analyse, sammenligning og arrangement-baserede spørgeskemaer.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <article className="rounded-lg border bg-background p-4">
              <p className="text-sm font-medium">DMU Admin</p>
              <p className="mt-1 text-xs text-muted-foreground">Centrale spørgsmål, skabeloner, arrangementer og tværgående overblik.</p>
            </article>
            <article className="rounded-lg border bg-background p-4">
              <p className="text-sm font-medium">Klub Admin</p>
              <p className="mt-1 text-xs text-muted-foreground">Egne spørgeskemaer, udsendelser, arrangementstatus og sammenligning med samlet gennemsnit.</p>
            </article>
          </div>
        </section>

        <section className="rounded-2xl border bg-background p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Log ind</h2>
          <p className="mt-1 text-sm text-muted-foreground">Fortsæt som DMU admin eller klub admin.</p>

          <form className="mt-6 space-y-4" method="post" action="/api/auth/login">
            <div className="space-y-1">
              <label htmlFor="email" className="text-sm font-medium">
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="admin@dmu.dk"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="text-sm font-medium">
                Adgangskode
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="••••••••"
              />
            </div>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <Button className="w-full" type="submit">
              Log ind
            </Button>
          </form>

          <div className="mt-6 rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Demo-login</p>
            <p>DMU admin: admin@dmu.dk / demo1234</p>
            <p>Klub admin: klub1@dmu.dk / demo1234</p>
            <p className="mt-1">
              Offentligt eksempel-link: <Link className="underline" href="/survey/demo-token">/survey/demo-token</Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
