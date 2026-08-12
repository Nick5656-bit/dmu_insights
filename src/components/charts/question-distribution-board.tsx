"use client";

import { useMemo, useState } from "react";
import { QuestionDistributionTile } from "@/components/charts/question-distribution-tile";

type BenchmarkRow = {
  questionTitle: string;
  category: string;
  avg: number | null;
  count: number;
  suppressed: boolean;
  distribution: { label: string; value: number }[];
};

type QuestionDistributionBoardProps = {
  rows: BenchmarkRow[];
  suppressionThreshold: number;
};

export function QuestionDistributionBoard({ rows, suppressionThreshold }: QuestionDistributionBoardProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALLE");
  const [showOnlyWithData, setShowOnlyWithData] = useState(false);

  const categories = useMemo(() => {
    return ["ALLE", ...Array.from(new Set(rows.map((row) => row.category))).sort((a, b) => a.localeCompare(b, "da"))];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesCategory = selectedCategory === "ALLE" || row.category === selectedCategory;
      const matchesSearch = normalizedSearch.length === 0 || row.questionTitle.toLowerCase().includes(normalizedSearch);
      const matchesDataMode = !showOnlyWithData || !row.suppressed;

      return matchesCategory && matchesSearch && matchesDataMode;
    });
  }, [rows, searchTerm, selectedCategory, showOnlyWithData]);

  const groupedRows = useMemo(() => {
    const map = new Map<string, BenchmarkRow[]>();

    for (const row of filteredRows) {
      const current = map.get(row.category) ?? [];
      current.push(row);
      map.set(row.category, current);
    }

    return Array.from(map.entries()).sort(([leftCategory, leftRows], [rightCategory, rightRows]) => {
      if (rightRows.length !== leftRows.length) {
        return rightRows.length - leftRows.length;
      }

      return leftCategory.localeCompare(rightCategory, "da");
    });
  }, [filteredRows]);

  const rowsWithData = rows.filter((row) => !row.suppressed).length;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-muted/20 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Søg spørgsmål</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Søg i spørgsmålsnavn..."
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Kategori</span>
            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category === "ALLE" ? "Alle kategorier" : category}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Data</span>
            <label className="flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm">
              <input
                type="checkbox"
                checked={showOnlyWithData}
                onChange={(event) => setShowOnlyWithData(event.target.checked)}
                className="h-4 w-4"
              />
              <span className="whitespace-nowrap">Vis kun spørgsmål med nok data</span>
            </label>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Viser {filteredRows.length} af {rows.length} spørgsmål · {rowsWithData} har nok data til at vise score.
        </p>
      </div>

      {groupedRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
          Ingen spørgsmål matcher de valgte filtre.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {groupedRows.map(([category, categoryRows]) => {
            const hasMultipleRows = categoryRows.length > 1;

            return (
              <section
                key={category}
                className={`rounded-[1.6rem] border border-border/70 bg-background/88 p-4 shadow-sm ${
                  hasMultipleRows ? "xl:col-span-2" : ""
                }`}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">{category}</h4>
                  <span className="rounded-full border bg-muted/35 px-3 py-1 text-xs text-muted-foreground">
                    {categoryRows.length} spørgsmål
                  </span>
                </div>

                <div className={`grid gap-4 ${hasMultipleRows ? "md:grid-cols-2" : ""}`}>
                  {categoryRows.map((row) => (
                    <QuestionDistributionTile
                      key={row.questionTitle}
                      title={row.questionTitle}
                      category={row.category}
                      avg={row.avg}
                      count={row.count}
                      suppressed={row.suppressed}
                      data={row.distribution}
                      suppressionThreshold={suppressionThreshold}
                      showCategoryLabel={false}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
