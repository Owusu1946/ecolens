import type { Dashboard, Permission } from "@ecolens/api/auth/roles";
import {
  Camera,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  Map as MapIcon,
  Settings,
  ShieldAlert,
  Siren,
} from "lucide-react";
import type { Route } from "next";

// Primary navigation. Each section maps to a stage of the operating model
// (brief section 4) and is shown only when the role holds `permission`. Hiding
// is a convenience: the API enforces every permission on its own.

export type Stage = "Observe" | "Analyse" | "Interpret" | "Validate" | "Escalate" | "Report";

export type NavItem = {
  href: Route;
  label: string;
  /** Shorter label for the phone tab bar. */
  short: string;
  icon: LucideIcon;
  stage: Stage | null;
  permission: Permission | null;
};

export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    short: "Overview",
    icon: LayoutDashboard,
    stage: null,
    permission: null,
  },
  {
    href: "/map",
    label: "Map",
    short: "Map",
    icon: MapIcon,
    stage: "Interpret",
    permission: "alert:read",
  },
  {
    href: "/alerts",
    label: "Alerts",
    short: "Alerts",
    icon: Siren,
    stage: "Validate",
    permission: "alert:read",
  },
  {
    href: "/incidents",
    label: "Incidents",
    short: "Incidents",
    icon: ShieldAlert,
    stage: "Escalate",
    permission: "incident:read",
  },
  {
    href: "/field-reports",
    label: "Field reports",
    short: "Field",
    icon: Camera,
    stage: "Observe",
    permission: "field_report:read",
  },
  {
    href: "/reports",
    label: "Reports",
    short: "Reports",
    icon: FileText,
    stage: "Report",
    permission: "report:read",
  },
  {
    href: "/admin",
    label: "Administration",
    short: "Admin",
    icon: Settings,
    stage: null,
    permission: "member:manage",
  },
];

export function navFor(permissions: readonly Permission[]) {
  return NAV_ITEMS.filter((item) => !item.permission || permissions.includes(item.permission));
}

// What each role dashboard is for (brief sections 8 and 11). Shown on the
// overview until its widgets are built.
export const DASHBOARDS: Record<Dashboard, { title: string; purpose: string; focus: string[] }> = {
  leadership: {
    title: "Leadership overview",
    purpose: "Whether Ecolens is producing earlier, trusted action across the pilot.",
    focus: [
      "Detection latency, validation quality and response speed",
      "Open incidents by institution and status",
      "Coverage of priority sites",
    ],
  },
  epa: {
    title: "EPA Western Region",
    purpose: "Alerts awaiting regulatory review and incidents your institution owns.",
    focus: [
      "Alerts waiting for validation",
      "Escalated incidents and their responsible institutions",
      "Recent field confirmations",
    ],
  },
  minerals_commission: {
    title: "Minerals Commission",
    purpose: "Suspected mining activity compared with concession boundaries.",
    focus: [
      "Land-disturbance alerts inside or near concessions",
      "Activity outside approved zones",
      "Incidents referred to the Commission",
    ],
  },
  water_resources_commission: {
    title: "Water Resources Commission",
    purpose: "River condition in the Pra and Ankobra basins.",
    focus: [
      "Turbidity and colour-change alerts by river reach",
      "Water-intake sites at risk",
      "Incidents affecting water resources",
    ],
  },
  analyst: {
    title: "Analyst workspace",
    purpose: "Triage and validate alerts with their full evidence trail.",
    focus: [
      "The alert queue, by confidence and age",
      "Evidence and provenance per alert",
      "Thresholds under review",
    ],
  },
  field: {
    title: "Field officer",
    purpose: "Confirm or reject alerts on the ground, with or without a connection.",
    focus: [
      "Assigned verifications near you",
      "Reports saved on this device and their sync state",
      "New report: GPS, photos, notes",
    ],
  },
  responder: {
    title: "Responder",
    purpose: "Incidents assigned to your assembly and the action taken.",
    focus: [
      "Assigned incidents and deadlines",
      "Record action taken (or a decision not to act)",
      "Recently closed cases",
    ],
  },
  admin: {
    title: "Platform administration",
    purpose: "Institutions, members, data sources and the audit trail.",
    focus: [
      "Members and roles per institution",
      "Data source health and freshness",
      "Audit trail of status changes",
    ],
  },
};
