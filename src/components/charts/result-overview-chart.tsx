"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildResultOverview, type OverviewSeries } from "@/lib/result-overview";

const colors = ["#284b80", "#a75e25", "#387565", "#8063a6"];
const number = (value: number) => value.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ResultOverviewChart({ series }: { series: OverviewSeries[] }) {
  const [selectedIds, setSelectedIds] = useState(() => series.filter(s => s.questions.length).slice(0, 1).map(s => s.id));
  const selected = series.filter(s => selectedIds.includes(s.id));
  const { rows, means, questions } = buildResultOverview(selected);
  return <section className="min-w-0 rounded-[28px] border border-border/70 bg-card p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-heading text-2xl font-semibold tracking-tight">Resultatoversigt</h2>
      <span className="text-xs text-muted-foreground">Skala 1–5</span>
    </div>
    {series.length > 1 && <details className="mt-3 rounded-xl border border-border/70 px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium">Vælg arrangementer / udsendelser ({selected.length})</summary>
      <p className="mt-2 text-xs text-muted-foreground">Vælg op til fire til sammenligning i samme graf.</p>
      <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
        {series.map(s => <label key={s.id} className="flex cursor-pointer items-start gap-2 rounded-lg p-2 text-sm hover:bg-muted/40">
          <input type="checkbox" className="mt-0.5 shrink-0" checked={selectedIds.includes(s.id)} disabled={!selectedIds.includes(s.id) && selectedIds.length >= 4}
            onChange={e => setSelectedIds(ids => e.target.checked ? [...ids, s.id] : ids.filter(id => id !== s.id))} />
          <span>{s.label}{!s.questions.length && <span className="text-muted-foreground"> — endnu ingen visbare skalasvar</span>}</span>
        </label>)}
      </div>
    </details>}
    {rows.length ? <>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {means.map((s, i) => <div key={s.key} className="flex items-start gap-2">
          <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: colors[i] }} />
          <div><p className="font-medium">{s.label}</p><p className="text-xs text-muted-foreground">Samlet gennemsnit: {number(s.value!)} / 5 · stiplet linje</p></div>
        </div>)}
      </div>
      <div className="mt-4 overflow-x-auto" role="region" aria-label="Kategorier og samlet gennemsnit" tabIndex={0}>
        <div style={{ minWidth: Math.max(480, rows.length * (80 + selected.length * 25)), height: 360 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 24, right: means.length === 1 ? 50 : 20, left: -20, bottom: 20 }} accessibilityLayer>
              <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="category" tick={{ fontSize: 12 }} interval={0} height={55} tickMargin={12} />
              <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => `${number(Number(value))} / 5`} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              {means.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={colors[i]} radius={[4, 4, 0, 0]} maxBarSize={64} isAnimationActive={false} />)}
              {means.map((s, i) => <ReferenceLine key={s.key} y={s.value!} stroke={colors[i]} strokeDasharray="6 4" strokeWidth={2}
                label={means.length === 1 ? { value: number(s.value!), position: "right", fill: colors[i], fontSize: 12 } : undefined} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Gennemsnit af gyldige 1–5-svar på de viste spørgsmål. Kun spørgsmål med mindst fem svar i hvert valgt arrangement indgår. Tekstsvar og “Ved ikke” tæller ikke med.</p>
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Beregningsgrundlag og tal ({questions.length} spørgsmål)</summary>
        <p className="mt-2">Alle gyldige talbesvarelser vægter lige. Ved sammenligning bruges kun fælles spørgsmål med tilstrækkeligt mange svar; gennemsnittet kan derfor ændre sig, når du ændrer valget. Grafvalget ændrer ikke filtrene for fordelingen nedenfor eller eksporten.</p>
        <ul className="mt-2 space-y-1">{questions.map(q => <li key={q.id}>{q.category}: {q.title}</li>)}</ul>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-left"><caption className="sr-only">Resultater som tabel</caption><thead><tr><th className="p-2">Kategori</th>{means.map(s => <th className="p-2" key={s.key}>{s.label}</th>)}</tr></thead><tbody>
          {rows.map(row => <tr key={row.category}><th className="p-2">{row.category}</th>{means.map(s => <td className="p-2" key={s.key}>{number(Number(row[s.key]))}</td>)}</tr>)}
          <tr><th className="p-2">Samlet gennemsnit</th>{means.map(s => <td className="p-2" key={s.key}>{number(s.value!)}</td>)}</tr>
        </tbody></table></div>
      </details>
    </> : <div className="py-12 text-center text-sm text-muted-foreground" role="status">
      {!series.length ? "Ingen arrangementer i det valgte udsnit." : !selected.length ? "Vælg et arrangement med resultater." : "Ingen fælles skalaspørgsmål med mindst fem svar i hvert valgt arrangement. Vælg et enkelt arrangement eller justér filtrene."}
    </div>}
  </section>;
}
