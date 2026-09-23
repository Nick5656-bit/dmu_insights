import type { buildResultOverview } from "@/lib/result-overview";

type Props = Pick<ReturnType<typeof buildResultOverview>, "rows" | "means"> & {
  color: (index: number) => string;
};

// Shares the desktop chart's already-suppressed aggregates, never raw answers.
// HTML labels wrap naturally; visible values do not depend on hover on a phone.
export function MobileResultBars({ rows, means, color }: Props) {
  const number = (value: number) => value.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <div className="mt-5 space-y-5 sm:hidden" role="region" aria-label="Resultater pr. kategori, vandrette søjler">
    {rows.map(row => <div key={String(row.category)} className="min-w-0">
      <h3 className="mb-2 break-words text-sm font-medium">{row.category}</h3>
      <div className="relative mr-10 border-l border-border">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex justify-between">
          {[0, 1, 2, 3, 4, 5].map(tick => <span key={tick} className="h-full border-l border-dashed border-border" />)}
        </div>
        <div className="relative space-y-2 py-1">
          {means.map((series, index) => {
            const value = Number(row[series.key]);
            if (!Number.isFinite(value)) return null;
            return <div key={series.key} className="relative flex h-7 items-center">
              <span className="sr-only">{series.label}: {number(value)} ud af 5</span>
              <div aria-hidden="true" className="h-6 rounded-r" style={{ width: `${value / 5 * 100}%`, backgroundColor: color(index) }} />
              <span aria-hidden="true" className="absolute left-full ml-2 text-xs font-semibold tabular-nums">{number(value)}</span>
            </div>;
          })}
        </div>
        {means.map((series, index) => series.value === null ? null : <span key={series.key} aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed"
          style={{ left: `${series.value / 5 * 100}%`, borderColor: color(index), filter: "drop-shadow(1px 0 0 white)" }} />)}
      </div>
    </div>)}
    <div aria-hidden="true" className="mr-10 flex justify-between border-t border-border pt-1 text-xs text-muted-foreground">
      {[0, 1, 2, 3, 4, 5].map(tick => <span key={tick}>{tick}</span>)}
    </div>
  </div>;
}
