import Link from "next/link";

type NextActionPanelProps = {
  eyebrow: string;
  title: string;
  description: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
};

export function NextActionPanel({
  eyebrow,
  title,
  description,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
}: NextActionPanelProps) {
  return (
    <section className="rounded-xl border bg-gradient-to-br from-background to-muted/20 p-6 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
      <h3 className="mt-2 text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={primaryHref} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          {primaryLabel}
        </Link>
        {secondaryLabel && secondaryHref ? (
          <Link href={secondaryHref} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
