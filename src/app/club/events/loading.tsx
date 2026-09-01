export default function ClubEventsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Hero */}
      <div className="rounded-[28px] bg-muted/30 p-6">
        <div className="h-4 w-36 rounded-full bg-muted/60" />
        <div className="mt-3 h-8 w-56 rounded-full bg-muted/60" />
        <div className="mt-4 h-10 w-64 rounded-2xl bg-muted/40" />
      </div>
      {/* Event cards */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-[24px] border border-border/40 bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="h-5 w-48 rounded-full bg-muted/50" />
                <div className="h-4 w-32 rounded-full bg-muted/40" />
                <div className="h-4 w-24 rounded-full bg-muted/30" />
              </div>
              <div className="h-8 w-28 rounded-xl bg-muted/40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
