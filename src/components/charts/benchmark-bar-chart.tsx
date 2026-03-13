"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type BenchmarkDatum = {
  label: string;
  own: number;
  benchmark: number;
};

export function BenchmarkBarChart({ data }: { data: BenchmarkDatum[] }) {
  return (
    <div className="h-80 w-full min-w-0 overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
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
  return (
    <div className="h-80 w-full min-w-0 overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis domain={[1, 5]} allowDecimals={true} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="own" name="Klubscore" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="benchmark" name="Samlet benchmark" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
