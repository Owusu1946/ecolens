"use client";

import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsFloat,
  parseAsString,
  parseAsStringLiteral,
  throttle,
  useQueryStates,
} from "nuqs";

import { BASEMAPS, type Basemap, DEFAULT_LAYERS, LAYER_KEYS, PILOT_VIEW } from "./config";

// Everything about the view lives in the URL, so a map can be shared or
// bookmarked exactly as seen, and the back button works.
const BASEMAP_KEYS = Object.keys(BASEMAPS) as Basemap[];

export const mapStateParsers = {
  view: parseAsStringLiteral(["globe", "flat"] as const).withDefault("flat"),
  basemap: parseAsStringLiteral(BASEMAP_KEYS),
  layers: parseAsArrayOf(parseAsStringLiteral(LAYER_KEYS)).withDefault(DEFAULT_LAYERS),
  rejected: parseAsBoolean.withDefault(false),
  alert: parseAsString,
  lng: parseAsFloat.withDefault(PILOT_VIEW.center[0]),
  lat: parseAsFloat.withDefault(PILOT_VIEW.center[1]),
  z: parseAsFloat.withDefault(PILOT_VIEW.zoom),
};

export function useMapState() {
  return useQueryStates(mapStateParsers, {
    history: "replace",
    limitUrlUpdates: throttle(300),
  });
}
