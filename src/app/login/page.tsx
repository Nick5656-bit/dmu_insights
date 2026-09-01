import Image from "next/image";
import Link from "next/link";
import { DmuLogo } from "@/components/dmu-logo";
import { LoginForm } from "@/components/login-form";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

const errorMessages: Record<string, string> = {
  invalid_credentials: "Forkert e-mail eller adgangskode.",
  invalid_input: "Udfyld både e-mail og adgangskode.",
  server_error: "Der opstod en fejl. Prøv igen.",
  rate_limited: "For mange forsøg. Prøv igen om 15 minutter.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = params.error ? errorMessages[params.error] : undefined;

  return (
    <div className="min-h-screen px-4 py-4">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-[1460px] overflow-hidden rounded-[2.25rem] border border-border/75 bg-background/84 shadow-[0_38px_90px_-48px_rgba(21,37,77,0.55)] backdrop-blur lg:grid-cols-[1.02fr_0.98fr]">

        {/* Venstre panel – baggrundsbillede og tagline */}
        <section className="relative hidden overflow-hidden border-r border-white/10 p-8 text-primary-foreground lg:flex lg:flex-col xl:p-12">
          <div className="absolute inset-0">
            <Image
              src="/login_pic.png"
              alt="Motocross-kører i luften"
              fill
              priority
              className="object-cover"
            />
            <div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(11,31,68,0.84),rgba(23,56,111,0.74))]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(116,214,213,0.16),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_28%)]" />
          </div>

          <div className="relative z-10 flex h-full flex-col justify-end">
            <div className="max-w-xl">
              <h1 className="text-5xl font-bold leading-[0.96] tracking-[-0.05em] xl:text-7xl">
                Få overblik.
                <br />
                Tag næste skridt.
              </h1>
            </div>
          </div>
        </section>

        {/* Højre panel – login-formular */}
        <section className="flex flex-col justify-center p-6 sm:p-8 lg:p-10 xl:p-14">
          <div className="mx-auto w-full max-w-[32rem]">

            {/* Logo øverst i login-panelet */}
            <DmuLogo variant="insights" />

            <div className="mt-10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Login
              </p>
              <h2 className="mt-3 text-4xl font-bold tracking-[-0.04em] text-foreground">
                Velkommen
              </h2>
            </div>

            <LoginForm error={error} />

            <div className="mt-5 rounded-[1.6rem] border bg-muted/22 p-5 text-sm text-muted-foreground">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold text-foreground">Demo-login</p>
                <Link
                  href="/survey/demo-token"
                  className="rounded-full border px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-background"
                >
                  Survey-link
                </Link>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <article className="rounded-[1.2rem] border bg-background/90 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">DMU</p>
                  <p className="mt-2 font-medium text-foreground">admin@dmu.dk</p>
                  <p className="text-muted-foreground">demo1234</p>
                </article>
                <article className="rounded-[1.2rem] border bg-background/90 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Klub</p>
                  <p className="mt-2 font-medium text-foreground">klub1@dmu.dk</p>
                  <p className="text-muted-foreground">demo1234</p>
                </article>
              </div>
            </div>

          </div>
        </section>
      </div>
    </div>
  );
}
