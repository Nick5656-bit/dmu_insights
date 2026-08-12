"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
  showCategoryLabel?: boolean;
};

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#7c3aed"];

export function QuestionDistributionTile({
  title,
  category,
  avg,
  count,
  suppressed,
  data,
  suppressionThreshold,
  showCategoryLabel = true,
}: QuestionDistributionTileProps) {
  const [chartType, setChartType] = useState<"donut" | "bar">("donut");
  const totalAnswers = data.reduce((sum, slice) => sum + slice.value, 0);

  const formatShare = (value: number) => {
    if (totalAnswers === 0) {
      return "0%";
    }
    const percentage = (value / totalAnswers) * 100;
    return `${percentage.toFixed(0)}%`;
  };

  return (
    <article className="min-w-0 rounded-xl border border-border/70 bg-gradient-to-b from-background to-muted/10 p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          {showCategoryLabel ? (
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{category}</p>
          ) : null}
          <h4 className={`text-sm font-semibold leading-5 ${showCategoryLabel ? "mt-1" : ""}`}>{title}</h4>
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <div className="rounded-full bg-background/90 px-3 py-1 text-xs font-medium text-muted-foreground">
            {count} svar
          </div>
          <div className="inline-flex rounded-md border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setChartType("donut")}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
                chartType === "donut" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
              aria-pressed={chartType === "donut"}
            >
              Donut
            </button>
            <button
              type="button"
              onClick={() => setChartType("bar")}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
                chartType === "bar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
              aria-pressed={chartType === "bar"}
            >
              Søjler
            </button>
          </div>
        </div>
      </div>

      {suppressed ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          Skjult af anonymitet (kræver mindst {suppressionThreshold} svar)
        </div>
      ) : (
        <>
          <div className="h-44 w-full min-w-0 overflow-hidden rounded-lg border border-border/60 bg-background/80 p-1">
            {chartType === "donut" ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} dataKey="value" nameKey="label" innerRadius={44} outerRadius={68} paddingAngle={2}>
                    {data.map((entry, index) => (
                      <Cell key={entry.label} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => {
                      const numericValue = Number(value ?? 0);
                      return [`${numericValue} svar (${formatShare(numericValue)})`, "Besvarelser"];
                    }}
                    labelFormatter={(label) => `Score ${label}`}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value) => {
                      const numericValue = Number(value ?? 0);
                      return [`${numericValue} svar (${formatShare(numericValue)})`, "Besvarelser"];
                    }}
                    labelFormatter={(label) => `Score ${label}`}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {data.map((entry, index) => (
                      <Cell key={entry.label} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-1 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Gns. tilfredshed</p>
            <p className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-sm font-semibold text-emerald-700">{avg ? avg.toFixed(2) : "-"}</p>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {data.map((slice, index) => (
              <span
                key={slice.label}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                title={`${slice.label}: ${slice.value} svar (${formatShare(slice.value)})`}
              >
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                {slice.label}: {slice.value} ({formatShare(slice.value)})
              </span>
            ))}
          </div>
        </>
      )}
    </article>
  );
}
