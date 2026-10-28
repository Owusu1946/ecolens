"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type {
  AlertProps,
  FeatureCollection,
  Geometry,
  Position,
} from "@ecolens/api/routers/v1/map";
import maplibregl, {
  type ExpressionSpecification,
  type GeoJSONSource,
  type LngLatBoundsLike,
  type StyleSpecification,
} from "maplibre-gl";
import { useEffect, useImperativeHandle, useRef } from "react";

import {
  ALERT_STATUS,
  BASEMAPS,
  type Basemap,
  CONFIDENCE,
  LABELS_TILES,
  LAYERS,
  type LayerKey,
} from "./config";

// One MapLibre instance for both the 3D globe and the flat map. Switching only
// changes the projection, so the camera, layers and selection stay put
// (brief section 11, "Map views"). Loaded on demand: the rest of the app never
// pays for MapLibre.

type AnyCollection = FeatureCollection<Geometry, Record<string, unknown> & { id: string }>;

export type MapData = {
  boundaries: AnyCollection;
  reaches: AnyCollection;
  sites: AnyCollection;
  alerts: FeatureCollection<Geometry, AlertProps>;
};

export type MapHandle = {
  flyTo: (center: [number, number], zoom: number) => void;
  zoomBy: (delta: number) => void;
  fitAlert: (id: string) => void;
};

type Props = {
  ref?: React.Ref<MapHandle>;
  initial: { lng: number; lat: number; z: number };
  projection: "globe" | "flat";
  basemap: Basemap;
  visible: LayerKey[];
  showRejected: boolean;
  selected: string | null;
  data: MapData | null;
  onSelect: (id: string | null) => void;
  onMove: (view: { lng: number; lat: number; z: number }) => void;
};

const EMPTY = { type: "FeatureCollection", features: [] } as const;
type SourceData = Parameters<GeoJSONSource["setData"]>[0];

const statusColor = [
  "match",
  ["get", "status"],
  ...Object.entries(ALERT_STATUS).flatMap(([k, v]) => [k, v.color]),
  "#94a3b8",
] as unknown as ExpressionSpecification;

const confidenceRadius = [
  "match",
  ["get", "confidence"],
  ...Object.entries(CONFIDENCE).flatMap(([k, v]) => [k, v.radius]),
  6,
] as unknown as ExpressionSpecification;

// Every point of a geometry, for bounds and marker anchors.
function positions(g: Geometry): Position[] {
  switch (g.type) {
    case "Point":
      return [g.coordinates];
    case "LineString":
    case "MultiPoint":
      return g.coordinates;
    case "Polygon":
    case "MultiLineString":
      return g.coordinates.flat();
    case "MultiPolygon":
      return g.coordinates.flat(2);
  }
}

function bounds(g: Geometry): [[number, number], [number, number]] {
  const ps = positions(g);
  const xs = ps.map((p) => p[0]);
  const ys = ps.map((p) => p[1]);
  return [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
  ];
}

// Alerts are drawn as a marker at their location (or the middle of their area),
// plus the area itself when they have one.
function alertMarkers(alerts: MapData["alerts"]) {
  return {
    type: "FeatureCollection" as const,
    features: alerts.features.map((f) => {
      const [[x0, y0], [x1, y1]] = bounds(f.geometry);
      return {
        type: "Feature" as const,
        id: f.id,
        properties: f.properties,
        geometry: { type: "Point" as const, coordinates: [(x0 + x1) / 2, (y0 + y1) / 2] },
      };
    }),
  };
}

function alertAreas(alerts: MapData["alerts"]) {
  return {
    type: "FeatureCollection" as const,
    features: alerts.features.filter(
      (f) => f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon",
    ),
  };
}

function style(basemap: Basemap, projection: Props["projection"]): StyleSpecification {
  const raster = (key: Basemap) => ({
    type: "raster" as const,
    tiles: [BASEMAPS[key].tiles],
    tileSize: 256,
    maxzoom: BASEMAPS[key].maxzoom,
    attribution: BASEMAPS[key].attribution,
  });
  return {
    version: 8,
    projection: { type: projection === "globe" ? "globe" : "mercator" },
    sky: {
      "sky-color": "#08120f",
      "horizon-color": "#1b3a35",
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0],
    },
    sources: {
      imagery: raster("imagery"),
      terrain: raster("terrain"),
      labels: {
        type: "raster",
        tiles: [LABELS_TILES],
        tileSize: 256,
        maxzoom: 16,
        attribution:
          'Labels © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, EOX',
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#0b1514" } },
      {
        id: "basemap-imagery",
        type: "raster",
        source: "imagery",
        layout: { visibility: basemap === "imagery" ? "visible" : "none" },
        paint: { "raster-fade-duration": 150 },
      },
      {
        id: "basemap-terrain",
        type: "raster",
        source: "terrain",
        layout: { visibility: basemap === "terrain" ? "visible" : "none" },
        paint: { "raster-fade-duration": 150 },
      },
      {
        id: "basemap-labels",
        type: "raster",
        source: "labels",
        minzoom: 6,
        layout: { visibility: basemap === "imagery" ? "visible" : "none" },
        paint: { "raster-opacity": 0.85 },
      },
    ],
  };
}

// Our data layers, grouped by the toggle that controls them.
const DATA_LAYERS: Record<LayerKey, maplibregl.AddLayerObject[]> = {
  basins: [
    {
      id: "basins-fill",
      type: "fill",
      source: "boundaries",
      filter: ["==", ["get", "kind"], "basin"],
      paint: { "fill-color": LAYERS.basins.swatch, "fill-opacity": 0.06 },
    },
    {
      id: "basins-line",
      type: "line",
      source: "boundaries",
      filter: ["==", ["get", "kind"], "basin"],
      paint: { "line-color": LAYERS.basins.swatch, "line-width": 1.25, "line-dasharray": [3, 2] },
    },
  ],
  reserves: [
    {
      id: "reserves-fill",
      type: "fill",
      source: "boundaries",
      filter: ["in", ["get", "kind"], ["literal", ["forest_reserve", "protected_area"]]],
      paint: { "fill-color": LAYERS.reserves.swatch, "fill-opacity": 0.14 },
    },
    {
      id: "reserves-line",
      type: "line",
      source: "boundaries",
      filter: ["in", ["get", "kind"], ["literal", ["forest_reserve", "protected_area"]]],
      paint: { "line-color": LAYERS.reserves.swatch, "line-width": 1.25 },
    },
  ],
  concessions: [
    {
      id: "concessions-fill",
      type: "fill",
      source: "boundaries",
      filter: ["==", ["get", "kind"], "mining_concession"],
      paint: { "fill-color": LAYERS.concessions.swatch, "fill-opacity": 0.12 },
    },
    {
      id: "concessions-line",
      type: "line",
      source: "boundaries",
      filter: ["==", ["get", "kind"], "mining_concession"],
      paint: {
        "line-color": LAYERS.concessions.swatch,
        "line-width": 1.25,
        "line-dasharray": [2, 1.5],
      },
    },
  ],
  reaches: [
    {
      id: "reaches-casing",
      type: "line",
      source: "reaches",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#082f49",
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2.5, 12, 7],
        "line-opacity": 0.6,
      },
    },
    {
      id: "reaches-line",
      type: "line",
      source: "reaches",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": LAYERS.reaches.swatch,
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.25, 12, 4],
      },
    },
  ],
  sites: [
    {
      id: "sites-circle",
      type: "circle",
      source: "sites",
      paint: {
        "circle-radius": 3.5,
        "circle-color": "#0b1514",
        "circle-stroke-color": LAYERS.sites.swatch,
        "circle-stroke-width": 1.5,
      },
    },
  ],
  alerts: [
    {
      id: "alerts-area-fill",
      type: "fill",
      source: "alert-areas",
      paint: { "fill-color": statusColor, "fill-opacity": 0.22 },
    },
    {
      id: "alerts-area-line",
      type: "line",
      source: "alert-areas",
      paint: { "line-color": statusColor, "line-width": 1.5 },
    },
    {
      id: "alerts-selected",
      type: "circle",
      source: "alert-markers",
      filter: ["==", ["get", "id"], ""],
      paint: {
        "circle-radius": ["+", confidenceRadius, 6],
        "circle-color": "rgba(255,255,255,0.15)",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    },
    {
      id: "alerts-points",
      type: "circle",
      source: "alert-markers",
      paint: {
        "circle-radius": confidenceRadius,
        "circle-color": statusColor,
        "circle-stroke-color": "#0b1514",
        "circle-stroke-width": 1.5,
      },
    },
  ],
};

const ALERT_LAYERS = DATA_LAYERS.alerts.map((l) => l.id);
const CLICKABLE = ["alerts-points", "alerts-area-fill"];

export default function MapCanvas({
  ref,
  initial,
  projection,
  basemap,
  visible,
  showRejected,
  selected,
  data,
  onSelect,
  onMove,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  // Latest values for handlers created once at load.
  const latest = useRef({
    onSelect,
    onMove,
    data,
    visible,
    showRejected,
    selected,
    basemap,
    projection,
  });
  latest.current = {
    onSelect,
    onMove,
    data,
    visible,
    showRejected,
    selected,
    basemap,
    projection,
  };

  useImperativeHandle(ref, () => ({
    flyTo: (center, zoom) => mapRef.current?.flyTo({ center, zoom, essential: true }),
    zoomBy: (delta) => mapRef.current?.easeTo({ zoom: (mapRef.current?.getZoom() ?? 0) + delta }),
    fitAlert: (id) => {
      const f = latest.current.data?.alerts.features.find((a) => a.id === id);
      if (!f || !mapRef.current) return;
      mapRef.current.fitBounds(bounds(f.geometry) as LngLatBoundsLike, {
        padding: 120,
        maxZoom: 12.5,
        essential: true,
      });
    },
  }));

  // biome-ignore lint/correctness/useExhaustiveDependencies: created once; later prop changes are applied by the effects below.
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: style(basemap, projection),
      center: [initial.lng, initial.lat],
      zoom: initial.z,
      attributionControl: { compact: true },
      maxPitch: 60,
      fadeDuration: 150,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", () => {
      map.addSource("boundaries", { type: "geojson", data: EMPTY });
      map.addSource("reaches", { type: "geojson", data: EMPTY });
      map.addSource("sites", { type: "geojson", data: EMPTY });
      map.addSource("alert-areas", { type: "geojson", data: EMPTY });
      map.addSource("alert-markers", { type: "geojson", data: EMPTY });
      // Draw order: areas under lines under points.
      for (const key of [
        "basins",
        "reserves",
        "concessions",
        "reaches",
        "sites",
        "alerts",
      ] as const) {
        for (const layer of DATA_LAYERS[key]) map.addLayer(layer);
      }
      ready.current = true;
      applyData(map, latest.current.data);
      applyVisibility(map, latest.current.visible);
      applyAlertFilters(map, latest.current.showRejected, latest.current.selected);
      applyBasemap(map, latest.current.basemap);
      applyProjection(map, latest.current.projection);
    });

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: "ecolens-popup",
    });
    for (const id of CLICKABLE) {
      map.on("mouseenter", id, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mousemove", id, (e) => {
        const p = e.features?.[0]?.properties as AlertProps | undefined;
        if (!p) return;
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<strong>ALT-${String(p.number).padStart(4, "0")}</strong> · ${ALERT_STATUS[p.status].label}<br/>${escapeHtml(p.title)}`,
          )
          .addTo(map);
      });
      map.on("mouseleave", id, () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
    }
    map.on("click", (e) => {
      const hit = map.queryRenderedFeatures(e.point, {
        layers: CLICKABLE.filter((l) => map.getLayer(l)),
      })[0];
      latest.current.onSelect(hit ? String(hit.properties.id) : null);
    });
    map.on("moveend", () => {
      const c = map.getCenter();
      latest.current.onMove({
        lng: round(c.lng, 4),
        lat: round(c.lat, 4),
        z: round(map.getZoom(), 2),
      });
    });

    return () => {
      ready.current = false;
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // MapLibre throws if the projection changes before the style has loaded; the
  // initial projection is in the style, and a change made while loading is
  // applied by the load handler.
  useEffect(() => {
    if (ready.current && mapRef.current) applyProjection(mapRef.current, projection);
  }, [projection]);

  useEffect(() => {
    if (ready.current && mapRef.current) applyBasemap(mapRef.current, basemap);
  }, [basemap]);

  useEffect(() => {
    if (ready.current && mapRef.current) applyData(mapRef.current, data);
  }, [data]);

  useEffect(() => {
    if (ready.current && mapRef.current) applyVisibility(mapRef.current, visible);
  }, [visible]);

  useEffect(() => {
    if (ready.current && mapRef.current) applyAlertFilters(mapRef.current, showRejected, selected);
  }, [showRejected, selected]);

  // MapLibre's stylesheet sets `position: relative` on the map element, and
  // unlayered CSS beats Tailwind utilities, so positioning lives on a wrapper.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="size-full" />
    </div>
  );
}

function applyProjection(map: maplibregl.Map, projection: Props["projection"]) {
  const type = projection === "globe" ? "globe" : "mercator";
  if (map.getProjection()?.type !== type) map.setProjection({ type });
}

function applyBasemap(map: maplibregl.Map, basemap: Basemap) {
  for (const key of Object.keys(BASEMAPS) as Basemap[]) {
    map.setLayoutProperty(`basemap-${key}`, "visibility", key === basemap ? "visible" : "none");
  }
  map.setLayoutProperty("basemap-labels", "visibility", basemap === "imagery" ? "visible" : "none");
}

function applyData(map: maplibregl.Map, data: MapData | null) {
  if (!data) return;
  (map.getSource("boundaries") as GeoJSONSource).setData(data.boundaries as unknown as SourceData);
  (map.getSource("reaches") as GeoJSONSource).setData(data.reaches as unknown as SourceData);
  (map.getSource("sites") as GeoJSONSource).setData(data.sites as unknown as SourceData);
  (map.getSource("alert-areas") as GeoJSONSource).setData(
    alertAreas(data.alerts) as unknown as SourceData,
  );
  (map.getSource("alert-markers") as GeoJSONSource).setData(
    alertMarkers(data.alerts) as unknown as SourceData,
  );
}

function applyVisibility(map: maplibregl.Map, visible: LayerKey[]) {
  for (const [key, layers] of Object.entries(DATA_LAYERS) as [
    LayerKey,
    maplibregl.AddLayerObject[],
  ][]) {
    for (const layer of layers) {
      map.setLayoutProperty(layer.id, "visibility", visible.includes(key) ? "visible" : "none");
    }
  }
}

function applyAlertFilters(map: maplibregl.Map, showRejected: boolean, selected: string | null) {
  const status: ExpressionSpecification = showRejected
    ? ["literal", true]
    : ["!=", ["get", "status"], "rejected"];
  for (const id of ALERT_LAYERS) {
    if (id === "alerts-selected") continue;
    map.setFilter(id, status);
  }
  map.setFilter("alerts-selected", ["==", ["get", "id"], selected ?? ""]);
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
