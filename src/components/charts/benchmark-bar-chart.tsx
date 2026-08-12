"use client";

import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type BenchmarkDatum = {
  label: string;
  own: number;
  benchmark: number;
};

export function BenchmarkBarChart({ data }: { data: BenchmarkDatum[] }) {
  return (
    <div className="h-80 w-full min-w-0 overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 28 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            interval={0}
            height={58}
            tickMargin={10}
            angle={-18}
            textAnchor="end"
            tick={{ fontSize: 11 }}
          />
          <YAxis domain={[1, 5]} allowDecimals={true} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="own" name="Egen klub" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="benchmark" name="Samlet benchmark" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ClubComparisonChart({ data }: { data: BenchmarkDatum[] }) {
  const benchmarkValue = data.length > 0 ? data[0].benchmark : null;

  return (
    <div className="w-full min-w-0 overflow-hidden">
      <div className="h-80 w-full min-w-0 overflow-hidden rounded-lg border border-border/60 bg-background px-2 pt-2">
        <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 30 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            interval={0}
            height={60}
            tickMargin={10}
            angle={-18}
            textAnchor="end"
            tick={{ fontSize: 11 }}
          />
          <YAxis domain={[1, 5]} allowDecimals={true} tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{ borderRadius: 10, borderColor: "var(--border)", fontSize: 12 }}
            formatter={(value, name) => {
              if (name === "Klubscore") {
                return [Number(value).toFixed(2), "Klubscore"];
              }
              return [value, name];
            }}
          />
          {benchmarkValue !== null ? (
            <ReferenceLine
              y={benchmarkValue}
              stroke="#334155"
              strokeDasharray="6 4"
              strokeWidth={2}
              label={{ value: `Benchmark ${benchmarkValue.toFixed(2)}`, position: "insideTopRight", fontSize: 11, fill: "#334155" }}
            />
          ) : null}
          <Bar dataKey="own" name="Klubscore" fill="var(--color-chart-3)" radius={[6, 6, 0, 0]} />
        </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "var(--color-chart-3)" }} />
          Klubscore
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="block h-0 w-7 border-t-2 border-dashed border-slate-700" />
          Samlet benchmark
        </span>
      </div>
    </div>
  );
}
