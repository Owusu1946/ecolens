"use client";

import { Button } from "@ecolens/ui/components/button";
import { cn } from "@ecolens/ui/lib/utils";
import { ArrowLeft, X } from "lucide-react";

// Pieces shared by the workflow screens (alert queue, incident register).

export function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  all,
}: {
  label: string;
  value: T | null;
  onChange: (value: T | null) => void;
  options: [T, string][];
  all?: string;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange((e.target.value || null) as T | null)}
        className={cn(
          "bg-background hover:bg-muted h-7 border px-2 pr-6 text-xs outline-none focus-visible:ring-1",
          value && all && "border-foreground/40",
        )}
      >
        {all && <option value="">{all}</option>}
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function CloseBar({
  label,
  back,
  onClose,
}: {
  label: string;
  back: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Button variant="ghost" size="sm" onClick={onClose} className="-ml-2 lg:hidden">
        <ArrowLeft /> {back}
      </Button>
      <span className="text-muted-foreground hidden font-mono text-[11px] lg:inline">{label}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Close"
        onClick={onClose}
        className="hidden lg:inline-flex"
      >
        <X />
      </Button>
    </div>
  );
}
