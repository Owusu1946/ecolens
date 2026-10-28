"use client";

import { cn } from "@ecolens/ui/lib/utils";
import { ChevronDown, EyeOff, Info } from "lucide-react";
import { useState } from "react";

import {
  ALERT_STATUS,
  BASEMAPS,
  type Basemap,
  CONFIDENCE,
  LAYER_KEYS,
  LAYERS,
  type LayerKey,
} from "./config";
import { ModeBadge, type Source, SourceDetails } from "./provenance";

type Props = {
  visible: LayerKey[];
  onToggle: (key: LayerKey) => void;
  basemap: Basemap;
  onBasemap: (b: Basemap) => void;
  showRejected: boolean;
  onShowRejected: (v: boolean) => void;
  /** Sources behind each layer, from the data itself. */
  layerSources: Partial<Record<LayerKey, Source[]>>;
  sitesSimulated: boolean;
  withheld: number;
  className?: string;
};

export function LayersPanel({
  visible,
  onToggle,
  basemap,
  onBasemap,
  showRejected,
  onShowRejected,
  layerSources,
  sitesSimulated,
  withheld,
  className,
}: Props) {
  const [open, setOpen] = useState<LayerKey | null>(null);

  return (
    <div className={cn("bg-background/95 text-foreground border backdrop-blur", className)}>
      <fieldset className="p-3">
        <legend className="text-muted-foreground float-left mb-2 w-full text-[11px] font-medium tracking-wide uppercase">
          Basemap
        </legend>
        <div className="clear-left grid grid-cols-2 gap-px border">
          {(Object.keys(BASEMAPS) as Basemap[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={basemap === key}
              onClick={() => onBasemap(key)}
              className={cn(
                "px-2 py-1.5 text-left text-xs outline-none focus-visible:ring-1",
                basemap === key ? "bg-muted font-medium" : "hover:bg-muted/60",
              )}
            >
              {BASEMAPS[key].label}
              <span className="text-muted-foreground block text-[10px] font-normal">
                {BASEMAPS[key].detail}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <section className="border-t p-3">
        <h2 className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
          Layers
        </h2>
        <ul>
          {LAYER_KEYS.map((key) => {
            const sources = layerSources[key] ?? [];
            const simulated =
              key === "sites" ? sitesSimulated : sources.some((s) => s.mode === "simulated");
            const expanded = open === key;
            return (
              <li key={key} className="py-1">
                <div className="flex items-center gap-2">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={visible.includes(key)}
                      onChange={() => onToggle(key)}
                      className="accent-foreground size-3.5"
                    />
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0"
                      style={{ backgroundColor: LAYERS[key].swatch }}
                    />
                    <span className="truncate">{LAYERS[key].label}</span>
                  </label>
                  {simulated && <ModeBadge mode="simulated" />}
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={`About ${LAYERS[key].label}`}
                    onClick={() => setOpen(expanded ? null : key)}
                    className="text-muted-foreground hover:text-foreground p-0.5 outline-none focus-visible:ring-1"
                  >
                    {expanded ? (
                      <ChevronDown className="size-3.5" />
                    ) : (
                      <Info className="size-3.5" />
                    )}
                  </button>
                </div>
                {expanded && (
                  <div className="bg-muted/40 mt-1.5 space-y-3 p-2">
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      {LAYERS[key].description}
                    </p>
                    {key === "alerts" && (
                      <p className="text-[11px] leading-relaxed">
                        Each alert carries its own coverage, confidence and limitations. Select one
                        to see them.
                      </p>
                    )}
                    {key === "sites" && (
                      <p className="text-[11px] leading-relaxed">
                        Ecolens monitoring locations
                        {sitesSimulated ? ", simulated for the prototype" : ""}.
                      </p>
                    )}
                    {sources.map((s) => (
                      <SourceDetails key={s.key} source={s} />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="border-t p-3">
        <h2 className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
          Alerts
        </h2>
        <ul className="space-y-1 text-xs">
          {Object.entries(ALERT_STATUS).map(([status, s]) => (
            <li key={status} className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
            </li>
          ))}
        </ul>
        <div className="text-muted-foreground mt-2 flex items-end gap-3 text-[11px]">
          {Object.entries(CONFIDENCE).map(([k, c]) => (
            <span key={k} className="flex items-center gap-1">
              <span
                aria-hidden
                className="bg-muted-foreground/60 rounded-full"
                style={{ width: c.radius * 1.4, height: c.radius * 1.4 }}
              />
              {c.label.replace(" confidence", "")}
            </span>
          ))}
          <span>confidence</span>
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={showRejected}
            onChange={(e) => onShowRejected(e.target.checked)}
            className="accent-foreground size-3.5"
          />
          Show alerts rejected by review
        </label>
      </section>

      {withheld > 0 && (
        <p className="text-muted-foreground flex items-start gap-2 border-t p-3 text-[11px] leading-relaxed">
          <EyeOff className="mt-px size-3.5 shrink-0" />
          {withheld} sensitive {withheld === 1 ? "location is" : "locations are"} not shown for your
          role.
        </p>
      )}
    </div>
  );
}
