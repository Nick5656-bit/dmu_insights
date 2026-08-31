export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Hero/filterpanel */}
      <div className="rounded-[28px] bg-primary/20 p-6 h-[148px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-6 w-20 rounded-full bg-white/15" />
            <div className="h-7 w-48 rounded-xl bg-white/15" />
          </div>
          <div className="flex gap-2">
            <div className="h-7 w-32 rounded-xl bg-white/15" />
            <div className="h-7 w-24 rounded-xl bg-white/15" />
            <div className="h-7 w-32 rounded-xl bg-white/15" />
          </div>
        </div>
        <div className="mt-4 h-14 rounded-[24px] bg-white/10" />
      </div>

      {/* Statistik-kort */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[24px] border border-border/70 bg-card p-5 shadow-sm">
            <div className="h-3 w-24 rounded bg-muted/60" />
            <div className="mt-3 h-9 w-16 rounded-lg bg-muted/60" />
            <div className="mt-2 h-3 w-28 rounded bg-muted/40" />
          </div>
        ))}
      </div>

      {/* Klubsammenligning + sidepanel */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_360px]">
        <div className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
          <div className="h-6 w-40 rounded-lg bg-muted/60" />
          <div className="mt-1 h-4 w-64 rounded bg-muted/40" />
          <div className="mt-5 h-56 rounded-[22px] bg-muted/30" />
        </div>
        <div className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm space-y-3">
          <div className="h-20 rounded-[22px] bg-muted/30" />
          <div className="h-20 rounded-[22px] bg-muted/30" />
          <div className="h-48 rounded-[22px] bg-muted/30" />
        </div>
      </div>

      {/* Spørgsmålsfordeling */}
      <div className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
        <div className="h-6 w-48 rounded-lg bg-muted/60" />
        <div className="mt-1 h-4 w-56 rounded bg-muted/40" />
        <div className="mt-5 h-40 rounded-[22px] bg-muted/30" />
      </div>
    </div>
  );
}
