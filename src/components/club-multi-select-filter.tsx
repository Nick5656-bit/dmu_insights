"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type ClubOption = {
  id: string;
  name: string;
};

type ClubMultiSelectFilterProps = {
  clubs: ClubOption[];
  initialSelectedIds: string[];
  inputName?: string;
  className?: string;
};

export function ClubMultiSelectFilter({
  clubs,
  initialSelectedIds,
  inputName = "clubIds",
  className,
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
    <div className={cn("min-w-0", isOpen && "relative z-50", className)}>
      {selectedIds.map((id) => (
        <input key={id} type="hidden" name={inputName} value={id} />
      ))}

      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex h-11 w-full items-center justify-between rounded-2xl border border-border/70 bg-background/95 px-3 text-sm text-foreground"
          aria-expanded={isOpen}
        >
          <span className="truncate text-left">
            {selectedClubs.length === 0
              ? "Alle klubber"
              : selectedClubs.length === 1
                ? selectedClubs[0].name
                : `${selectedClubs.length} klubber valgt`}
          </span>
          <span className="text-xs text-muted-foreground">Vælg</span>
        </button>

        {isOpen ? (
          <div className="absolute left-0 top-full z-[60] mt-2 w-[24rem] max-w-[calc(100vw-2rem)] rounded-[1.25rem] border border-border/80 bg-background p-3 text-foreground shadow-[0_24px_50px_-30px_rgba(15,23,42,0.45)]">
            <div className="flex items-center gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Søg klub..."
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
              {filteredClubs.length === 0 ? <p className="px-3 py-3 text-sm text-muted-foreground">Ingen klubber matcher.</p> : null}
            </div>

            <div className="mt-3 flex justify-end">
              <button type="button" onClick={() => setIsOpen(false)} className="h-10 rounded-xl border border-border/70 px-3 text-xs font-medium text-foreground hover:bg-muted">
                Luk
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {selectedClubs.map((club) => (
          <button
            key={club.id}
            type="button"
            onClick={() => toggleClub(club.id)}
            className="inline-flex items-center gap-1 rounded-full border bg-muted/20 px-2 py-1 text-xs text-foreground"
            title="Fjern klub"
          >
            <span className="truncate max-w-[10rem]">{club.name}</span>
            <span className="text-muted-foreground">x</span>
          </button>
        ))}
      </div>
    </div>
  );
}
