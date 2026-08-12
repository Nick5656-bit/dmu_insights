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
    <section className="overflow-hidden rounded-[1.8rem] border border-border/75 bg-[linear-gradient(135deg,rgba(16,36,77,0.98),rgba(33,64,122,0.9))] p-6 text-primary-foreground shadow-[0_30px_60px_-42px_rgba(21,37,77,0.8)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-foreground/70">{eyebrow}</p>
          <h3 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h3>
          <p className="mt-3 max-w-2xl text-sm text-primary-foreground/76">{description}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={primaryHref}
            className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-primary shadow-[0_16px_30px_-24px_rgba(255,255,255,0.65)] transition hover:bg-white/92"
          >
            {primaryLabel}
          </Link>
          {secondaryLabel && secondaryHref ? (
            <Link
              href={secondaryHref}
              className="rounded-full border border-white/16 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
            >
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
