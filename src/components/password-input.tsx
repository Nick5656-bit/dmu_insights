"use client";

import { useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function PasswordInput({ className, disabled, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} disabled={disabled} type={visible ? "text" : "password"} className={cn(className, "pr-16")} />
      <button
        type="button"
        disabled={disabled}
        aria-label={visible ? "Skjul adgangskode" : "Vis adgangskode"}
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
        className="absolute inset-y-0 right-1 my-1 rounded-md px-3 text-xs font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {visible ? "Skjul" : "Vis"}
      </button>
    </div>
  );
}
