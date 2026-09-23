"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type EventCalendarItem = {
  id: string;
  dateKey: string;
  title: string;
  subtitle?: string;
  calendarState?: "READY" | "AWAITING";
  badges?: string[];
  actions?: Array<{
    label: string;
    href: string;
    variant?: "primary" | "secondary";
  }>;
  details: Array<{
    label: string;
    value: string;
  }>;
};

type EventCalendarProps = {
  title?: string;
  description?: string;
  emptyText: string;
  items: EventCalendarItem[];
};

type CalendarMonth = {
  year: number;
  month: number;
};

type DayVisualState = "EMPTY" | "READY" | "AWAITING" | "MIXED";

const weekdayLabels = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

function parseDateKey(dateKey: string): CalendarMonth & { day: number } {
  const [year, month, day] = dateKey.split("-").map(Number);
  return {
    year,
    month: month - 1,
    day,
  };
}

function toMonthKey(month: CalendarMonth) {
  return `${month.year}-${String(month.month + 1).padStart(2, "0")}`;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getMonthLabel(month: CalendarMonth) {
  return new Intl.DateTimeFormat("da-DK", {
    month: "long",
    year: "numeric",
  }).format(new Date(month.year, month.month, 1));
}

function getDateLabel(dateKey: string) {
  const { year, month, day } = parseDateKey(dateKey);
  return new Intl.DateTimeFormat("da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month, day));
}

function addMonth(month: CalendarMonth, delta: number): CalendarMonth {
  const nextDate = new Date(month.year, month.month + delta, 1);
  return {
    year: nextDate.getFullYear(),
    month: nextDate.getMonth(),
  };
}

function buildMonthDays(month: CalendarMonth) {
  const firstDay = new Date(month.year, month.month, 1);
  const lastDay = new Date(month.year, month.month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalDays = lastDay.getDate();

  return {
    startOffset,
    totalDays,
  };
}

function getDayVisualState(dayItems: EventCalendarItem[]): DayVisualState {
  if (dayItems.length === 0) {
    return "EMPTY";
  }

  const readyCount = dayItems.filter((item) => item.calendarState === "READY").length;
  const awaitingCount = dayItems.filter((item) => item.calendarState === "AWAITING").length;

  if (readyCount > 0 && awaitingCount > 0) {
    return "MIXED";
  }

  if (readyCount > 0 && awaitingCount === 0) {
    return "READY";
  }

  if (awaitingCount > 0 && readyCount === 0) {
    return "AWAITING";
  }

  return "EMPTY";
}

function getBadgeToneClass(badge: string) {
  const normalized = badge.trim().toLowerCase();

  if (normalized.includes("klar til udsendelse") || normalized.includes("klub klar")) {
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  }

  if (normalized.includes("afventer klarmelding") || normalized.includes("afventer klubbens klarmelding") || normalized.includes("afventer klub")) {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }

  return "border bg-muted/30 text-foreground";
}

function EventCard({ item }: { item: EventCalendarItem }) {
  return (
    <article className="min-w-0 rounded-xl border bg-background p-3 shadow-sm sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 break-words">
          <h5 className="text-base font-semibold">{item.title}</h5>
          {item.subtitle ? <p className="mt-1 text-sm text-muted-foreground">{item.subtitle}</p> : null}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {item.badges?.map((badge) => (
            <span key={badge} className={cn("rounded-full px-3 py-1 text-xs font-medium", getBadgeToneClass(badge))}>
              {badge}
            </span>
          ))}
          {item.actions?.map((action) => (
            <Link
              key={`${item.id}-${action.href}-${action.label}`}
              href={action.href}
              className={cn(
                "inline-flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors sm:min-h-0 sm:text-xs",
                action.variant === "primary" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border hover:bg-muted",
              )}
            >
              {action.label}
            </Link>
          ))}
        </div>
      </div>
      <dl className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {item.details.map((detail) => (
          <div key={`${item.id}-${detail.label}`} className="min-w-0 rounded-lg border bg-muted/10 p-3">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{detail.label}</dt>
            <dd className="mt-1 break-words text-sm font-medium text-foreground">{detail.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function EventCalendar({ title, description, emptyText, items }: EventCalendarProps) {
  // Use the visitor's local date rather than the first arrangement in the list.
  // Otherwise an older event can look like the current day when the calendar opens.
  const [today] = useState(() => new Date());
  const todayKey = toDateKey(today);

  const sortedItems = useMemo(
    () => [...items].sort((left, right) => left.dateKey.localeCompare(right.dateKey) || left.title.localeCompare(right.title)),
    [items],
  );

  const [currentMonth, setCurrentMonth] = useState<CalendarMonth>(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(todayKey);
  const [mobileView, setMobileView] = useState<"list" | "calendar">("list");

  const itemsByDate = useMemo(() => {
    const map = new Map<string, EventCalendarItem[]>();
    for (const item of sortedItems) {
      const currentItems = map.get(item.dateKey) ?? [];
      currentItems.push(item);
      map.set(item.dateKey, currentItems);
    }
    return map;
  }, [sortedItems]);

  const currentMonthKey = toMonthKey(currentMonth);
  const monthItems = sortedItems.filter((item) => item.dateKey.startsWith(currentMonthKey));
  const selectedItems = selectedDateKey ? itemsByDate.get(selectedDateKey) ?? [] : [];
  const { startOffset, totalDays } = buildMonthDays(currentMonth);

  function changeMonth(delta: number) {
    const nextMonth = addMonth(currentMonth, delta);
    setCurrentMonth(nextMonth);

    const nextMonthKey = toMonthKey(nextMonth);
    const nextSelectedDate = sortedItems.find((item) => item.dateKey.startsWith(nextMonthKey))?.dateKey ?? null;
    setSelectedDateKey(nextSelectedDate);
  }

  function showToday() {
    setCurrentMonth({ year: today.getFullYear(), month: today.getMonth() });
    setSelectedDateKey(todayKey);
  }

  return (
    <section className="min-w-0 rounded-xl border bg-background p-3 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {title ? <h3 className="text-lg font-semibold">{title}</h3> : null}
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <div className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <button
            type="button"
            onClick={showToday}
            className="col-span-3 min-h-11 justify-self-end rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted sm:min-h-0"
          >
            I dag
          </button>
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-md border hover:bg-muted sm:h-10 sm:w-10"
            aria-label="Forrige måned"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div aria-live="polite" className="min-w-0 rounded-md border bg-muted/20 px-2 py-2 text-center text-sm font-medium capitalize sm:min-w-[11rem] sm:px-4">
            {getMonthLabel(currentMonth)}
          </div>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            className="flex h-11 w-11 items-center justify-center rounded-md border hover:bg-muted sm:h-10 sm:w-10"
            aria-label="Næste måned"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg border bg-muted/20 p-1 sm:hidden" role="group" aria-label="Kalendervisning">
        {([['list', 'Liste'], ['calendar', 'Kalender']] as const).map(([view, label]) => (
          <button key={view} type="button" aria-pressed={mobileView === view} onClick={() => setMobileView(view)}
            className={cn("min-h-11 rounded-md px-3 text-sm font-medium", mobileView === view ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {label}
          </button>
        ))}
      </div>

      <div className={cn("mt-5 overflow-x-auto p-1", mobileView === "list" ? "hidden sm:block" : "block")}>
        <div className="sm:min-w-[860px]">
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-muted-foreground sm:gap-2 sm:text-left sm:text-xs">
            {weekdayLabels.map((label) => (
              <div key={label} className="py-1 font-medium sm:px-2">
                {label}
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1 sm:gap-2">
            {Array.from({ length: startOffset }).map((_, index) => (
              <div key={`empty-${index}`} className="min-h-12 rounded-md border border-dashed border-border/60 bg-muted/10 sm:min-h-24 sm:rounded-xl" />
            ))}

            {Array.from({ length: totalDays }).map((_, index) => {
              const day = index + 1;
              const dateKey = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayItems = itemsByDate.get(dateKey) ?? [];
              const dayVisualState = getDayVisualState(dayItems);
              const isSelected = selectedDateKey === dateKey;
              const isToday = todayKey === dateKey;
              const isClickable = dayItems.length > 0;

              const dayToneClass =
                dayVisualState === "READY"
                  ? "border-emerald-300 bg-emerald-50"
                  : dayVisualState === "AWAITING"
                    ? "border-amber-300 bg-amber-50"
                    : "border-border/70 bg-background";

              const countToneClass =
                dayVisualState === "READY"
                  ? "bg-emerald-100 text-emerald-800"
                  : dayVisualState === "AWAITING"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-primary/10 text-primary";

              const mixedBackgroundStyle =
                dayVisualState === "MIXED"
                  ? {
                      backgroundImage:
                        "linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(16, 185, 129, 0.12) 50%, rgba(245, 158, 11, 0.12) 50%, rgba(245, 158, 11, 0.12) 100%)",
                    }
                  : undefined;

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => setSelectedDateKey(dateKey)}
                  aria-label={`${getDateLabel(dateKey)}${isToday ? ", i dag" : ""}, ${dayItems.length} arrangementer`}
                  aria-pressed={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  style={mixedBackgroundStyle}
                  className={cn(
                    "flex min-h-12 min-w-0 flex-col rounded-md border p-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset sm:min-h-24 sm:rounded-xl sm:p-2.5",
                    isSelected ? "ring-1 ring-inset ring-primary" : "",
                    isToday && !isSelected ? "border-primary/50" : "",
                    dayVisualState === "MIXED" ? "border-emerald-300" : dayToneClass,
                    isClickable ? "hover:brightness-[0.98]" : "cursor-default text-muted-foreground",
                  )}
                >
                  <div className="flex w-full flex-col items-center justify-between gap-0.5 sm:flex-row sm:gap-2">
                    <span className={cn("text-sm font-semibold", isClickable ? "text-foreground" : "text-muted-foreground")}>
                      {day}
                      {isToday ? <span className="ml-1 hidden text-[10px] font-medium text-primary sm:inline">I dag</span> : null}
                    </span>
                    {dayItems.length > 0 ? (
                      <span className={cn("rounded-full px-1 text-[10px] font-medium sm:px-2 sm:py-0.5 sm:text-[11px]", countToneClass)}>
                        {dayItems.length}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 hidden w-full min-w-0 space-y-1.5 sm:block">
                    {dayItems.slice(0, 2).map((item) => (
                      <div key={item.id} className="rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5">
                        <p className="truncate text-xs font-medium text-foreground">
                          {item.calendarState === "READY" ? <span className="text-emerald-700">● </span> : null}
                          {item.calendarState === "AWAITING" ? <span className="text-amber-700">● </span> : null}
                          {item.title}
                        </p>
                        {item.subtitle ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.subtitle}</p> : null}
                      </div>
                    ))}
                    {dayItems.length > 2 ? <p className="text-[11px] text-muted-foreground">+ {dayItems.length - 2} flere</p> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={cn("mt-4 space-y-4 sm:hidden", mobileView !== "list" && "hidden")}>
        <p className="text-sm text-muted-foreground">{monthItems.length} arrangementer i {getMonthLabel(currentMonth)}</p>
        {monthItems.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Ingen arrangementer i denne måned.</p>
        ) : [...new Set(monthItems.map(item => item.dateKey))].map(dateKey => (
          <div key={dateKey} className="space-y-2">
            <h4 className="text-sm font-semibold capitalize">{getDateLabel(dateKey)}</h4>
            {itemsByDate.get(dateKey)?.map(item => <EventCard key={item.id} item={item} />)}
          </div>
        ))}
      </div>

      <div className={cn("mt-6 rounded-2xl border bg-muted/10 p-3 sm:p-4", mobileView === "list" ? "hidden sm:block" : "block")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold">Dagsoversigt</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedDateKey ? getDateLabel(selectedDateKey) : "Vælg en dag i kalenderen for at se arrangementerne."}
            </p>
          </div>
          <div className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
            {monthItems.length} arrangementer i {getMonthLabel(currentMonth)}
          </div>
        </div>

        {selectedItems.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed bg-background p-8 text-center text-sm text-muted-foreground">{emptyText}</div>
        ) : (
          <div className="mt-4 space-y-3">
            {selectedItems.map((item) => (
              <EventCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
