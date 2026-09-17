"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildResultOverview, buildResultTimeline, type OverviewSeries } from "@/lib/result-overview";

const colors = ["#284b80", "#a75e25", "#387565", "#8063a6"];
const color = (index: number) => colors[index] ?? `hsl(${(index * 137.508) % 360} 45% 38%)`;
const number = (value: number) => value.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ResultOverviewChart({ series, comparison = false }: { series: OverviewSeries[]; comparison?: boolean }) {
  const { rows, means, questions } = buildResultOverview(series);
  const [view, setView] = useState<"comparison" | "timeline">("comparison");
  const [category, setCategory] = useState<string>("");
  const selectedCategory = rows.some(row => row.category === category) ? category : "";
  const timeline = buildResultTimeline(series, selectedCategory || null);
  const showTimeline = view === "timeline" && timeline.length > 1;
  const scrollCategories = rows.length > 12;
  return <section className="min-w-0 rounded-[28px] border border-border/70 bg-card p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-heading text-2xl font-semibold tracking-tight">Resultatoversigt</h2>
      <span className="text-xs text-muted-foreground">Skala 1–5</span>
    </div>
    {rows.length ? <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-border p-1 text-xs" role="group" aria-label="Grafvisning">
          <button type="button" aria-pressed={!showTimeline} onClick={() => setView("comparison")} className={`rounded-full px-3 py-2 ${!showTimeline ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Sammenligning</button>
          <button type="button" aria-pressed={showTimeline} disabled={timeline.length < 2} onClick={() => setView("timeline")} className={`rounded-full px-3 py-2 disabled:opacity-50 ${showTimeline ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Udvikling over tid</button>
        </div>
        {showTimeline && <label className="flex items-center gap-2 text-xs">Vis
          <select value={selectedCategory} onChange={event => setCategory(event.target.value)} className="max-w-full rounded-full border border-border bg-card px-3 py-2 text-sm">
            <option value="">Samlet gennemsnit</option>
            {rows.map(row => <option key={row.category} value={row.category}>{row.category}</option>)}
          </select>
        </label>}
        {timeline.length < 2 && <p className="text-xs text-muted-foreground">Vælg mindst to arrangementer i filtrene for at se udviklingen over tid.</p>}
      </div>
      {showTimeline ? <>
        <div className={`mt-4 min-w-0 ${timeline.length > 12 ? "overflow-x-auto" : "overflow-x-hidden"}`} role="region" aria-label="Udvikling over tid" tabIndex={timeline.length > 12 ? 0 : undefined}>
          <div style={{ width: "100%", minWidth: timeline.length > 12 ? timeline.length * 100 : 0, height: 360 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={timeline} margin={{ top: 24, right: 25, left: -20, bottom: 20 }} accessibilityLayer>
                <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="id" tickFormatter={id => timeline.find(point => point.id === id)?.dateLabel ?? ""} tick={{ fontSize: 11 }} interval="preserveStartEnd" height={55} tickMargin={12} padding={{ left: 20, right: 20 }} />
                <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 12 }} />
                <Tooltip labelFormatter={id => { const point = timeline.find(point => point.id === id); return point ? `${point.dateLabel} · ${point.label}` : String(id); }} formatter={value => `${number(Number(value))} / 5`} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Line type="linear" dataKey="value" name={selectedCategory || "Samlet gennemsnit"} stroke={color(0)} strokeWidth={2} dot={{ r: 5 }} activeDot={{ r: 7 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Ét punkt pr. arrangement i datoorden. Forskellige deltagere kan påvirke forskellen mellem resultaterne.</p>
      </> : <>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {means.map((s, i) => <div key={s.key} className="flex items-start gap-2">
          <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: color(i) }} />
          <div><p className="font-medium">{s.label}</p><p className="text-xs text-muted-foreground">Samlet gennemsnit: {number(s.value!)} / 5 · stiplet linje</p></div>
        </div>)}
      </div>
      <div className={`mt-4 min-w-0 ${scrollCategories ? "overflow-x-auto" : "overflow-x-hidden"}`} role="region" aria-label="Kategorier og samlet gennemsnit" tabIndex={scrollCategories ? 0 : undefined}>
        <div style={{ width: "100%", minWidth: scrollCategories ? rows.length * (80 + series.length * 25) : 0, height: 360 }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={rows} margin={{ top: 24, right: means.length === 1 ? 50 : 20, left: -20, bottom: 20 }} accessibilityLayer>
              <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="category" tick={{ fontSize: rows.length > 6 ? 10 : 12 }} interval={0} height={rows.length > 6 ? 80 : 55} tickMargin={12}
                angle={rows.length > 6 ? -35 : 0} textAnchor={rows.length > 6 ? "end" : "middle"} />
              <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => `${number(Number(value))} / 5`} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              {means.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={color(i)} radius={[4, 4, 0, 0]} maxBarSize={64} isAnimationActive={false} />)}
              {means.map((s, i) => <ReferenceLine key={s.key} y={s.value!} stroke={color(i)} strokeDasharray="6 4" strokeWidth={2}
                label={means.length === 1 ? { value: number(s.value!), position: "right", fill: color(i), fontSize: 12 } : undefined} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      </>}
      <p className="mt-2 text-xs text-muted-foreground">Gennemsnit af gyldige 1–5-svar på de viste spørgsmål. {comparison ? "Kun fælles spørgsmål med mindst fem svar i hvert valgt arrangement indgår." : "Kun spørgsmål med mindst fem svar i det valgte udsnit indgår."} Tekstsvar og “Ved ikke” tæller ikke med.</p>
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Beregningsgrundlag og tal ({questions.length} spørgsmål)</summary>
        <p className="mt-2">Alle gyldige talbesvarelser vægter lige. Ved sammenligning bruges kun fælles spørgsmål med tilstrækkeligt mange svar; gennemsnittet kan derfor ændre sig, når du ændrer valget. Filtrene øverst gælder også spørgsmålsfordelingen og eksporten.</p>
        {showTimeline && <>
          <p className="mt-2">Datoen er løbsdatoen, eller udsendelsesdatoen for målinger uden arrangement. Hvis målingen ikke har en udsendelsesdato, bruges oprettelsesdatoen. Punkterne står med lige afstand i datoorden, ikke efter antallet af dage imellem dem.</p>
          <table className="mt-3 w-full text-left"><caption className="text-left">Udvikling: {selectedCategory || "Samlet gennemsnit"}</caption>
            <thead><tr><th className="p-2">Dato</th><th className="p-2">Arrangement</th><th className="p-2">Gennemsnit</th></tr></thead>
            <tbody>{timeline.map(point => <tr key={point.id}><td className="p-2">{point.dateLabel}</td><th className="p-2">{point.label}</th><td className="p-2">{number(point.value)}</td></tr>)}</tbody>
          </table>
        </>}
        <ul className="mt-2 space-y-1">{questions.map(q => <li key={q.id}>{q.category}: {q.title}</li>)}</ul>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-left"><caption className="sr-only">Resultater som tabel</caption><thead><tr><th className="p-2">Kategori</th>{means.map(s => <th className="p-2" key={s.key}>{s.label}</th>)}</tr></thead><tbody>
          {rows.map(row => <tr key={row.category}><th className="p-2">{row.category}</th>{means.map(s => <td className="p-2" key={s.key}>{number(Number(row[s.key]))}</td>)}</tr>)}
          <tr><th className="p-2">Samlet gennemsnit</th>{means.map(s => <td className="p-2" key={s.key}>{number(s.value!)}</td>)}</tr>
        </tbody></table></div>
      </details>
    </> : <div className="py-12 text-center text-sm text-muted-foreground" role="status">
      {comparison ? "Ingen fælles skalaspørgsmål med mindst fem svar i hvert valgt arrangement. Vælg et enkelt arrangement eller justér filtrene." : "Der er endnu ikke skalaspørgsmål med mindst fem svar i det valgte udsnit."}
    </div>}
  </section>;
}
