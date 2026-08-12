import Link from "next/link";

type WizardStep = {
  id: number;
  title: string;
  description: string;
  primaryCtaLabel: string;
  primaryHref: string;
};

type GettingStartedWizardProps = {
  title: string;
  subtitle: string;
  steps: WizardStep[];
};

export function GettingStartedWizard({ title, subtitle, steps }: GettingStartedWizardProps) {
  return (
    <section className="rounded-[1.8rem] border bg-background p-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Forløb</p>
        <h3 className="mt-2 text-2xl font-bold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {steps.map((step) => (
          <article key={step.id} className="rounded-[1.5rem] border border-border/75 bg-muted/20 p-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground">
                {step.id}
              </span>
              <h4 className="text-lg font-bold">{step.title}</h4>
            </div>

            <p className="mt-3 text-sm text-muted-foreground">{step.description}</p>

            <div className="mt-4">
              <Link href={step.primaryHref} className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
                {step.primaryCtaLabel}
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
