// GET forms can submit repeated values; old links also use comma-separated IDs.
export function parseSelectionIds(value: string | string[] | null | undefined): string[] {
  return [...new Set((Array.isArray(value) ? value : [value ?? ""])
    .flatMap(item => item.split(",")).map(item => item.trim()).filter(Boolean))];
}

export function parseDashboardYear(value: string | null | undefined): number | null {
  return value && /^\d{4}$/.test(value) ? Number(value) : null;
}
