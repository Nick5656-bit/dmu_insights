export default function TemplatesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Hero */}
      <div className="rounded-[28px] bg-primary/20 p-6 h-[104px]">
        <div className="h-3 w-36 rounded bg-white/15" />
        <div className="mt-2 h-8 w-40 rounded-xl bg-white/15" />
        <div className="mt-2 h-3 w-52 rounded bg-white/10" />
      </div>

      {/* Skabelonliste */}
      <div className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="h-6 w-36 rounded-lg bg-muted/60" />
          <div className="h-9 w-36 rounded-2xl bg-muted/60" />
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-[22px] border border-border/60 p-5 space-y-3">
              <div className="h-5 w-3/4 rounded-lg bg-muted/60" />
              <div className="h-4 w-1/2 rounded bg-muted/40" />
              <div className="flex gap-2 pt-1">
                <div className="h-6 w-20 rounded-full bg-muted/40" />
                <div className="h-6 w-24 rounded-full bg-muted/40" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
