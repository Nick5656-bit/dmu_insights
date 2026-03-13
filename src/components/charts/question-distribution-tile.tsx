"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

type DistributionSlice = {
  label: string;
  value: number;
};

type QuestionDistributionTileProps = {
  title: string;
  category: string;
  avg: number | null;
  count: number;
  suppressed: boolean;
  data: DistributionSlice[];
  suppressionThreshold: number;
};

const COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];

export function QuestionDistributionTile({
  title,
  category,
  avg,
  count,
  suppressed,
  data,
  suppressionThreshold,
}: QuestionDistributionTileProps) {
  return (
    <article className="min-w-0 rounded-xl border bg-background p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{category}</p>
          <h4 className="mt-1 text-sm font-semibold leading-5">{title}</h4>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">Svar</p>
          <p className="text-sm font-semibold">{count}</p>
        </div>
      </div>

      {suppressed ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          Skjult af anonymitet (kræver mindst {suppressionThreshold} svar)
        </div>
      ) : (
        <>
          <div className="h-44 w-full min-w-0 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="label" innerRadius={44} outerRadius={68} paddingAngle={2}>
                  {data.map((entry, index) => (
                    <Cell key={entry.label} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${Number(value ?? 0)} svar`} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-1 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Gns. tilfredshed</p>
            <p className="text-sm font-semibold">{avg ? avg.toFixed(2) : "-"}</p>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {data.map((slice, index) => (
              <span key={slice.label} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                {slice.label}: {slice.value}
              </span>
            ))}
          </div>
        </>
      )}
    </article>
  );
}
