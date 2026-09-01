import Image from "next/image";
import dmuLogo from "@/../public/dmu-logo.png";
import dmuInsightsLogo from "@/../public/dmu-insights-logo.png";

type DmuLogoProps = {
  compact?: boolean;
  surface?: "plain" | "card";
  size?: "default" | "sm";
  /** "insights" = DMU Insights logo (admin platform), "classic" = standard DMU logo (surveys, public pages) */
  variant?: "insights" | "classic";
};

export function DmuLogo({ compact = false, surface = "plain", size = "default", variant = "classic" }: DmuLogoProps) {
  const isInsights = variant === "insights";

  // Insights logo has wider aspect ratio (~3.2:1), classic is ~3.4:1 – keep similar heights
  const imageWidth = isInsights
    ? compact ? (size === "sm" ? 140 : 168) : 220
    : compact ? (size === "sm" ? 104 : 132) : 180;

  const imageHeight = isInsights
    ? compact ? (size === "sm" ? 44 : 52) : 68
    : compact ? (size === "sm" ? 31 : 39) : 52;

  const image = (
    <Image
      src={isInsights ? dmuInsightsLogo : dmuLogo}
      alt={isInsights ? "DMU Insights" : "Danmarks Motor Union"}
      width={imageWidth}
      height={imageHeight}
      className="h-auto w-auto"
      priority
    />
  );

  return (
    <div className="flex items-center gap-3">
      {surface === "card" ? (
        <div
          className={`inline-flex rounded-[1.25rem] border border-white/15 bg-white/96 shadow-[0_18px_34px_-24px_rgba(15,23,42,0.5)] ${
            size === "sm" ? "p-2.5" : "p-3"
          }`}
        >
          {image}
        </div>
      ) : (
        image
      )}
      {!compact && !isInsights ? (
        <span className="rounded-full border border-border/70 bg-background/75 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Medlemsfeedback
        </span>
      ) : null}
    </div>
  );
}
