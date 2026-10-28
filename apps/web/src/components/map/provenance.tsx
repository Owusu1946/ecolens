import { cn } from "@ecolens/ui/lib/utils";

// Provenance shown with every layer and alert (principles 3, 9, 11).

export type Source = {
  key: string;
  name: string;
  kind: string;
  mode: "live" | "prepared" | "simulated";
  description: string;
  methodology: string | null;
  knownLimitations: string;
  spatialResolution: string | null;
  updateFrequency: string | null;
  licence: string | null;
  url: string | null;
  steward: { name: string; shortName: string } | null;
};

const MODE = {
  live: {
    label: "Live",
    className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
  },
  prepared: { label: "Prepared", className: "border-sky-500/40 text-sky-700 dark:text-sky-300" },
  simulated: {
    label: "Simulated",
    className: "border-amber-500/50 text-amber-700 dark:text-amber-300",
  },
} as const;

export function ModeBadge({ mode, className }: { mode: Source["mode"]; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-4.5 shrink-0 items-center border px-1 text-[10px] font-medium",
        MODE[mode].className,
        className,
      )}
    >
      {MODE[mode].label}
    </span>
  );
}

export function SourceDetails({ source }: { source: Source }) {
  const facts = [
    ["Steward", source.steward?.name ?? "Ecolens platform team"],
    ["Updated", source.updateFrequency],
    ["Resolution", source.spatialResolution],
    ["Licence", source.licence],
  ].filter((f): f is [string, string] => !!f[1]);

  return (
    <div className="space-y-1.5 text-[11px] leading-relaxed">
      <div className="flex items-start justify-between gap-2">
        <span className="text-foreground font-medium">{source.name}</span>
        <ModeBadge mode={source.mode} />
      </div>
      <p className="text-muted-foreground">{source.description}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p>
        <span className="text-muted-foreground">Limitations: </span>
        {source.knownLimitations}
      </p>
    </div>
  );
}
