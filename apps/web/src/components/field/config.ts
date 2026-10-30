import type { V1RouterClient } from "@ecolens/api/routers/index";

export type FieldReportList = Awaited<ReturnType<V1RouterClient["fieldReports"]["list"]>>;
export type FieldReportListItem = FieldReportList["items"][number];
export type FieldReport = Awaited<ReturnType<V1RouterClient["fieldReports"]["get"]>>;
export type VerificationRequest = Awaited<
  ReturnType<V1RouterClient["fieldReports"]["requests"]>
>[number];
export type Assessment = "supports_alert" | "contradicts_alert" | "inconclusive";

export const ASSESSMENT: Record<Assessment, { label: string; hint: string }> = {
  supports_alert: { label: "Supports the alert", hint: "What I saw matches the change flagged." },
  contradicts_alert: {
    label: "Contradicts the alert",
    hint: "The change isn't there, or has another cause.",
  },
  inconclusive: { label: "Inconclusive", hint: "I couldn't tell, or couldn't reach the spot." },
};

// Mirrors the API's list. Plain descriptions of what was seen, not of who did it.
export const ACTIVITY = {
  dredging: "Dredging",
  excavation: "Excavation or pits",
  heavy_machinery: "Heavy machinery",
  sediment_plume: "Sediment plume",
  river_discolouration: "River discolouration",
  forest_clearing: "Forest clearing",
  access_track: "New access track",
  camp_or_settlement: "Camp or settlement",
  farm_burning: "Burning",
  none_observed: "Nothing observed",
  other: "Other",
} as const;
export type Activity = keyof typeof ACTIVITY;

export const activityLabel = (a: string) => ACTIVITY[a as Activity] ?? a.replaceAll("_", " ");

/** Distance in km between two points (haversine). */
export function distanceKm(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export const formatKm = (km: number) =>
  km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
