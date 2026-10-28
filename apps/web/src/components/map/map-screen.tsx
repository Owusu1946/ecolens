"use client";

import { Button } from "@ecolens/ui/components/button";
import { cn } from "@ecolens/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Crosshair, Globe2, Layers, Map as MapIcon, Minus, Plus, WifiOff } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import { useCanCallApi } from "@/components/shell/use-me";
import { useLiteMode, useOnline } from "@/hooks/use-network";
import { orpc } from "@/utils/orpc";

import { AlertPanel } from "./alert-panel";
import { BOUNDARY_LAYER, type LayerKey, PILOT_VIEW, WORLD_VIEW } from "./config";
import { LayersPanel } from "./layers-panel";
import type { MapData, MapHandle } from "./map-canvas";
import type { Source } from "./provenance";
import { useMapState } from "./use-map-state";

// MapLibre (~250 KB gzipped) loads only when the map is opened.
const MapCanvas = dynamic(() => import("./map-canvas"), {
  ssr: false,
  loading: () => (
    <div className="text-muted-foreground absolute inset-0 grid place-items-center bg-[#0b1514] text-xs">
      Loading map…
    </div>
  ),
});

const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

export function MapScreen() {
  const [state, setState] = useMapState();
  const lite = useLiteMode();
  const online = useOnline();
  const canCall = useCanCallApi();
  const mapRef = useRef<MapHandle>(null);
  const [initial] = useState(() => ({ lng: state.lng, lat: state.lat, z: state.z }));
  const [layersOpen, setLayersOpen] = useState(false);

  const layers = useQuery({
    ...orpc.map.layers.queryOptions(),
    enabled: canCall,
    staleTime: 60 * 60_000,
  });
  const alerts = useQuery({ ...orpc.map.alerts.queryOptions(), enabled: canCall });

  // Low-bandwidth mode starts on the lighter basemap unless one was chosen.
  const basemap = state.basemap ?? (lite ? "terrain" : "imagery");

  const data = useMemo<MapData | null>(() => {
    if (!layers.data) return null;
    return {
      boundaries: layers.data.boundaries,
      reaches: layers.data.reaches,
      sites: layers.data.sites,
      alerts: alerts.data?.alerts ?? { type: "FeatureCollection", features: [] },
    } as MapData;
  }, [layers.data, alerts.data]);

  const layerSources = useMemo(() => {
    const out: Partial<Record<LayerKey, Source[]>> = {};
    if (!layers.data) return out;
    const byKey = new Map(layers.data.sources.map((s) => [s.key, s as Source]));
    const add = (layer: LayerKey | undefined, key: string) => {
      const source = byKey.get(key);
      if (!layer || !source) return;
      out[layer] ??= [];
      if (!out[layer].includes(source)) out[layer].push(source);
    };
    for (const f of layers.data.boundaries.features)
      add(BOUNDARY_LAYER[f.properties.kind], f.properties.sourceKey);
    for (const f of layers.data.reaches.features) add("reaches", f.properties.sourceKey);
    return out;
  }, [layers.data]);

  const selected =
    alerts.data?.alerts.features.find((f) => f.id === state.alert)?.properties ?? null;

  // A shared link that names an alert opens on it.
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || !state.alert || !alerts.data) return;
    fitted.current = true;
    // Wait a frame so the canvas has mounted.
    requestAnimationFrame(() => mapRef.current?.fitAlert(state.alert as string));
  }, [alerts.data, state.alert]);

  const toggleLayer = (key: LayerKey) =>
    void setState({
      layers: state.layers.includes(key)
        ? state.layers.filter((k) => k !== key)
        : [...state.layers, key],
    });

  const withheld = (layers.data?.withheld ?? 0) + (alerts.data?.withheld ?? 0);
  const updatedAt = alerts.dataUpdatedAt || layers.dataUpdatedAt;
  const noData = !layers.data && !layers.isFetching;

  const panel = (
    <LayersPanel
      visible={state.layers}
      onToggle={toggleLayer}
      basemap={basemap}
      onBasemap={(b) => void setState({ basemap: b })}
      showRejected={state.rejected}
      onShowRejected={(v) => void setState({ rejected: v })}
      layerSources={layerSources}
      sitesSimulated={layers.data?.sites.features.some((f) => f.properties.isSimulated) ?? false}
      withheld={withheld}
    />
  );

  return (
    <div className="relative h-full min-h-[24rem] overflow-hidden bg-[#0b1514]">
      <MapCanvas
        ref={mapRef}
        initial={initial}
        projection={state.view}
        basemap={basemap}
        visible={state.layers}
        showRejected={state.rejected}
        selected={state.alert}
        data={data}
        onSelect={(id) => void setState({ alert: id })}
        onMove={(v) => void setState(v)}
      />

      {/* Layers: a card on desktop, a sheet on phones. */}
      <div className="pointer-events-none absolute inset-y-3 left-3 hidden w-72 flex-col lg:flex">
        <div className="pointer-events-auto max-h-full overflow-y-auto">{panel}</div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="bg-background/95 absolute top-3 left-3 lg:hidden"
        aria-expanded={layersOpen}
        onClick={() => setLayersOpen((o) => !o)}
      >
        <Layers /> Layers
      </Button>
      {layersOpen && (
        <div className="absolute inset-x-0 bottom-0 z-10 max-h-[70%] overflow-y-auto lg:hidden">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="bg-background m-2"
              onClick={() => setLayersOpen(false)}
            >
              Done
            </Button>
          </div>
          {panel}
        </div>
      )}

      {/* View controls. */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
        <fieldset className="bg-background/95 flex border">
          <legend className="sr-only">Map view</legend>
          {(
            [
              ["flat", "Map", MapIcon],
              ["globe", "Globe", Globe2],
            ] as const
          ).map(([view, label, Icon]) => (
            <button
              key={view}
              type="button"
              aria-pressed={state.view === view}
              onClick={() => void setState({ view })}
              className={cn(
                "flex h-8 items-center gap-1.5 px-2.5 text-xs outline-none focus-visible:ring-1",
                state.view === view
                  ? "bg-muted font-medium"
                  : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </fieldset>
        <div className="bg-background/95 flex flex-col border">
          <MapButton label="Zoom in" onClick={() => mapRef.current?.zoomBy(1)}>
            <Plus />
          </MapButton>
          <MapButton label="Zoom out" onClick={() => mapRef.current?.zoomBy(-1)}>
            <Minus />
          </MapButton>
          <MapButton
            label="Pilot area"
            onClick={() => mapRef.current?.flyTo(PILOT_VIEW.center, PILOT_VIEW.zoom)}
          >
            <Crosshair />
          </MapButton>
          {state.view === "globe" && (
            <MapButton
              label="Whole globe"
              onClick={() => mapRef.current?.flyTo(WORLD_VIEW.center, WORLD_VIEW.zoom)}
            >
              <Globe2 />
            </MapButton>
          )}
        </div>
      </div>

      {selected && (
        <AlertPanel
          alert={selected}
          onClose={() => void setState({ alert: null })}
          className="absolute inset-x-0 bottom-0 z-10 max-h-[60%] lg:inset-x-auto lg:top-3 lg:right-14 lg:bottom-3 lg:max-h-none lg:w-80"
        />
      )}

      {/* Status: freshness, offline, and what's missing. */}
      <div className="pointer-events-none absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 lg:left-[calc(50%+9rem)]">
        {!online && (
          <p className="bg-background/95 flex items-center gap-1.5 border border-amber-500/40 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-200">
            <WifiOff className="size-3" />
            Offline · showing saved data; imagery only where you've looked before
          </p>
        )}
        {noData && (
          <p className="bg-background/95 border px-2 py-1 text-[11px]">
            {online || canCall
              ? layers.isError
                ? "Couldn't load map data."
                : "Loading map data…"
              : "No map data saved on this device yet."}
          </p>
        )}
        {updatedAt > 0 && (
          <p className="bg-background/80 text-muted-foreground px-2 py-0.5 text-[11px]">
            Alerts as of {time.format(updatedAt)}
          </p>
        )}
      </div>
    </div>
  );
}

function MapButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button variant="ghost" size="icon" aria-label={label} title={label} onClick={onClick}>
      {children}
    </Button>
  );
}
