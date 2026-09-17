"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type ClubOption = {
  id: string;
  name: string;
};

type ClubMultiSelectFilterProps = {
  id?: string;
  clubs: ClubOption[];
  initialSelectedIds: string[];
  inputName?: string;
  className?: string;
  labels?: { all: string; selected: string; search: string; empty: string };
};

export function ClubMultiSelectFilter({
  id,
  clubs,
  initialSelectedIds,
  inputName = "clubIds",
  className,
  labels = { all: "Alle klubber", selected: "klubber valgt", search: "Søg klub", empty: "Ingen klubber matcher." },
}: ClubMultiSelectFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    [...new Set(initialSelectedIds)].filter((id) => clubs.some((club) => club.id === id)),
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedClubs = useMemo(
    () => clubs.filter((club) => selectedSet.has(club.id)),
    [clubs, selectedSet],
  );

  const filteredClubs = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return clubs;
    }
    return clubs.filter((club) => club.name.toLowerCase().includes(term));
  }, [clubs, query]);

  function toggleClub(clubId: string) {
    setSelectedIds((prev) => {
      if (prev.includes(clubId)) {
        return prev.filter((id) => id !== clubId);
      }
      return [...prev, clubId];
    });
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  return (
    <div className={cn("min-w-0", isOpen && "relative z-50", className)} onKeyDown={(event) => { if (event.key === "Escape") setIsOpen(false); }}>
      {selectedIds.map((id) => (
        <input key={id} type="hidden" name={inputName} value={id} />
      ))}

      <div className="relative">
        <button
          id={id}
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={isOpen}
        >
          <span className="truncate text-left">
            {selectedClubs.length === 0
              ? labels.all
              : selectedClubs.length === 1
                ? selectedClubs[0].name
                : `${selectedClubs.length} ${labels.selected}`}
          </span>
          <span className="text-xs text-muted-foreground">Vælg</span>
        </button>

        {isOpen ? (
          <div className="absolute left-0 top-full z-[60] mt-2 w-full sm:w-[22rem] max-w-[calc(100vw-4rem)] rounded-[1.25rem] border border-border/80 bg-background p-3 text-foreground shadow-[0_24px_50px_-30px_rgba(15,23,42,0.45)]">
            <div className="flex items-center gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`${labels.search}...`}
                aria-label={labels.search}
                className="h-10 w-full rounded-xl border border-border/70 px-3 text-sm text-foreground placeholder:text-muted-foreground"
              />
              <button type="button" onClick={clearSelection} className="h-10 rounded-xl border border-border/70 px-3 text-xs font-medium text-foreground hover:bg-muted">
                Ryd
              </button>
            </div>

            <div className="mt-3 max-h-56 overflow-auto rounded-xl border border-border/70">
              {filteredClubs.map((club) => (
                <label key={club.id} className="flex cursor-pointer items-center gap-2 border-b border-border/60 px-3 py-2 text-sm text-foreground last:border-b-0 hover:bg-muted/40">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(club.id)}
                    onChange={() => toggleClub(club.id)}
                    className="h-4 w-4"
                  />
                  <span className="min-w-0 truncate">{club.name}</span>
                </label>
              ))}
              {filteredClubs.length === 0 ? <p className="px-3 py-3 text-sm text-muted-foreground">{labels.empty}</p> : null}
            </div>

            <div className="mt-3 flex justify-end">
              <button type="button" onClick={() => setIsOpen(false)} className="h-10 rounded-xl border border-border/70 px-3 text-xs font-medium text-foreground hover:bg-muted">
                Luk
              </button>
            </div>
          </div>
        ) : null}
      </div>

    </div>
  );
}
