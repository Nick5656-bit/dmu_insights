import Link from "next/link";

type WizardStep = {
  id: number;
  title: string;
  description: string;
  primaryCtaLabel: string;
  primaryHref: string;
  settingsHref: string;
};

type GettingStartedWizardProps = {
  title: string;
  subtitle: string;
  steps: WizardStep[];
};

export function GettingStartedWizard({ title, subtitle, steps }: GettingStartedWizardProps) {
  return (
    <section className="rounded-xl border bg-background p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {steps.map((step) => (
          <article key={step.id} className="rounded-lg border p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Trin {step.id}</p>
            <h4 className="mt-1 text-base font-semibold">{step.title}</h4>
            <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={step.primaryHref} className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
                {step.primaryCtaLabel}
              </Link>
              <Link href={step.settingsHref} className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted">
                Åbn indstillinger
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
