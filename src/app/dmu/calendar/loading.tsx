export default function CalendarLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Hero */}
      <div className="rounded-[28px] bg-primary/20 p-6 h-[104px]">
        <div className="h-3 w-24 rounded bg-white/15" />
        <div className="mt-2 h-8 w-36 rounded-xl bg-white/15" />
        <div className="mt-2 h-3 w-48 rounded bg-white/10" />
      </div>

      {/* Kalender-grid */}
      <div className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="h-6 w-32 rounded-lg bg-muted/60" />
          <div className="flex gap-2">
            <div className="h-9 w-9 rounded-xl bg-muted/40" />
            <div className="h-9 w-9 rounded-xl bg-muted/40" />
          </div>
        </div>
        {/* Ugedage header */}
        <div className="mt-5 grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-5 rounded bg-muted/40" />
          ))}
        </div>
        {/* Dage */}
        <div className="mt-2 grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted/20" />
          ))}
        </div>
      </div>

      {/* Kommende arrangementer */}
      <div className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
        <div className="h-5 w-44 rounded-lg bg-muted/60" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-[22px] bg-muted/30" />
          ))}
        </div>
      </div>
    </div>
  );
}
