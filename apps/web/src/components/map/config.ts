import type { AlertProps } from "@ecolens/api/routers/v1/map";

// Map configuration shared by the canvas, the layer panel and the legend.

export const PILOT_VIEW = { center: [-1.95, 5.32] as [number, number], zoom: 8.6 };
export const WORLD_VIEW = { center: [-1.95, 7] as [number, number], zoom: 1.6 };

// Basemaps: EOX tiles, free and global. WMTS order is {z}/{y}/{x}.
export const BASEMAPS = {
  imagery: {
    label: "Satellite",
    detail: "Sentinel-2 cloudless 2024",
    tiles: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg",
    maxzoom: 15,
    attribution:
      '<a href="https://s2maps.eu" target="_blank" rel="noreferrer">Sentinel-2 cloudless 2024</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2024)',
  },
  terrain: {
    label: "Terrain",
    detail: "Light, about half the data",
    tiles: "https://tiles.maps.eox.at/wmts/1.0.0/terrain-light_3857/default/g/{z}/{y}/{x}.jpg",
    maxzoom: 16,
    attribution:
      'Terrain Light { Data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors and others, Rendering © <a href="https://eox.at" target="_blank" rel="noreferrer">EOX</a> }',
  },
} as const;
export type Basemap = keyof typeof BASEMAPS;

export const LABELS_TILES =
  "https://tiles.maps.eox.at/wmts/1.0.0/overlay_bright_3857/default/g/{z}/{y}/{x}.png";

export const LAYER_KEYS = [
  "alerts",
  "reaches",
  "basins",
  "reserves",
  "concessions",
  "sites",
] as const;
export type LayerKey = (typeof LAYER_KEYS)[number];
export const DEFAULT_LAYERS: LayerKey[] = [
  "alerts",
  "reaches",
  "basins",
  "reserves",
  "concessions",
];

export const LAYERS: Record<LayerKey, { label: string; description: string; swatch: string }> = {
  alerts: {
    label: "Alerts",
    description:
      "Potential changes flagged by agreed rules. Each is a prompt for review, not proof.",
    swatch: "#f59e0b",
  },
  reaches: {
    label: "River reaches",
    description: "Monitored stretches of the Ankobra, Bonsa and Pra.",
    swatch: "#38bdf8",
  },
  basins: {
    label: "Pilot basins",
    description: "Approximate extent of the Ankobra and lower Pra basins.",
    swatch: "#7dd3fc",
  },
  reserves: {
    label: "Forest reserves",
    description: "Protected forest to compare canopy loss against.",
    swatch: "#4ade80",
  },
  concessions: {
    label: "Mining concessions",
    description: "Licensed areas to compare suspected activity against (use case 3).",
    swatch: "#c084fc",
  },
  sites: {
    label: "Monitoring sites",
    description: "Locations where readings are taken or reviewed.",
    swatch: "#e2e8f0",
  },
};

// Which boundary kinds feed which layer.
export const BOUNDARY_LAYER: Record<string, LayerKey | undefined> = {
  basin: "basins",
  forest_reserve: "reserves",
  mining_concession: "concessions",
  protected_area: "reserves",
};

// Alert colour follows where it is in the workflow, not how alarming it looks:
// an unreviewed alert is a question, not a finding (principle 2).
export const ALERT_STATUS: Record<AlertProps["status"], { label: string; color: string }> = {
  new: { label: "Needs review", color: "#f59e0b" },
  in_review: { label: "In review", color: "#fb923c" },
  confirmed: { label: "Confirmed by review", color: "#f43f5e" },
  unresolved: { label: "Unresolved", color: "#a78bfa" },
  rejected: { label: "Rejected by review", color: "#94a3b8" },
};

export const CONFIDENCE: Record<AlertProps["confidence"], { label: string; radius: number }> = {
  low: { label: "Low confidence", radius: 5 },
  medium: { label: "Medium confidence", radius: 7 },
  high: { label: "High confidence", radius: 9 },
};

export const LENS_LABEL: Record<AlertProps["lens"], string> = {
  water: "Water",
  forest_land: "Forests & land",
  air: "Air",
};
