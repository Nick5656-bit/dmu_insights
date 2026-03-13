import Image from "next/image";

type DmuLogoProps = {
  compact?: boolean;
};

export function DmuLogo({ compact = false }: DmuLogoProps) {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/dmu-logo.png"
        alt="Danmarks Motor Union"
        width={compact ? 152 : 210}
        height={compact ? 44 : 60}
        priority
      />
      {!compact ? <span className="text-xs uppercase tracking-wide text-muted-foreground">Feedback Portal</span> : null}
    </div>
  );
}
