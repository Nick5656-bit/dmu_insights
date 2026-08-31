export default function QuestionsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Hero */}
      <div className="rounded-[28px] bg-primary/20 p-6 h-[104px]">
        <div className="h-3 w-36 rounded bg-white/15" />
        <div className="mt-2 h-8 w-52 rounded-xl bg-white/15" />
        <div className="mt-2 h-3 w-40 rounded bg-white/10" />
      </div>

      {/* Opret spørgsmål */}
      <div className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
        <div className="h-6 w-36 rounded-lg bg-muted/60" />
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="h-10 rounded-2xl bg-muted/40" />
          <div className="h-10 rounded-2xl bg-muted/40" />
          <div className="h-10 rounded-2xl bg-muted/40" />
          <div className="h-10 rounded-2xl bg-muted/40" />
        </div>
        <div className="mt-4 h-10 w-32 rounded-2xl bg-muted/60" />
      </div>

      {/* Spørgsmålsliste */}
      <div className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
        <div className="h-5 w-28 rounded-lg bg-muted/60" />
        <div className="mt-1 h-4 w-20 rounded bg-muted/40" />
        <div className="mt-4 flex gap-3">
          <div className="h-10 flex-1 rounded-2xl bg-muted/40" />
          <div className="h-10 flex-1 rounded-2xl bg-muted/40" />
          <div className="h-10 w-24 rounded-2xl bg-muted/60" />
        </div>
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-[22px] bg-muted/30" />
          ))}
        </div>
      </div>
    </div>
  );
}
