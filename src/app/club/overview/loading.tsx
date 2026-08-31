export default function ClubOverviewLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Hero */}
      <div className="rounded-[28px] bg-primary/20 p-6 h-[120px]">
        <div className="h-3 w-24 rounded bg-white/15" />
        <div className="mt-2 h-8 w-48 rounded-xl bg-white/15" />
        <div className="mt-3 flex gap-2">
          <div className="h-7 w-28 rounded-xl bg-white/15" />
          <div className="h-7 w-28 rounded-xl bg-white/15" />
        </div>
      </div>

      {/* Statistik-kort */}
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-[24px] border border-border/70 bg-card p-5 shadow-sm">
            <div className="h-3 w-24 rounded bg-muted/60" />
            <div className="mt-3 h-9 w-16 rounded-lg bg-muted/60" />
            <div className="mt-2 h-3 w-28 rounded bg-muted/40" />
          </div>
        ))}
      </div>

      {/* Seneste aktivitet */}
      <div className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
        <div className="h-6 w-40 rounded-lg bg-muted/60" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-[22px] bg-muted/30" />
          ))}
        </div>
      </div>
    </div>
  );
}
