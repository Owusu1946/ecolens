import type { V1RouterClient } from "@ecolens/api/routers/index";

export type IncidentList = Awaited<ReturnType<V1RouterClient["incidents"]["list"]>>;
export type IncidentListItem = IncidentList["items"][number];
export type Incident = Awaited<ReturnType<V1RouterClient["incidents"]["get"]>>;
export type IncidentStatus = IncidentListItem["status"];
export type Severity = IncidentListItem["severity"];
export type ActionKind = Incident["actions"][number]["kind"];

export const incidentRef = (n: number) => `INC-${String(n).padStart(4, "0")}`;

// Where the response stands. Colours are kept apart from the alert review
// colours so the two workflows are never confused on screen.
export const INCIDENT_STATUS: Record<IncidentStatus, { label: string; color: string }> = {
  open: { label: "Awaiting assignment", color: "#38bdf8" },
  assigned: { label: "Assigned", color: "#6366f1" },
  in_progress: { label: "In progress", color: "#8b5cf6" },
  action_recorded: { label: "Action recorded", color: "#14b8a6" },
  closed: { label: "Closed", color: "#94a3b8" },
};

// Statuses a response can still change from (mirrors the API).
export const ACTIVE: readonly IncidentStatus[] = [
  "open",
  "assigned",
  "in_progress",
  "action_recorded",
];

// Severity is the potential environmental impact, never culpability (principle 2).
export const SEVERITY: Record<Severity, { label: string; hint: string }> = {
  high: {
    label: "High severity",
    hint: "Serious or spreading harm, or risk to people or water supply.",
  },
  medium: { label: "Medium severity", hint: "Clear harm that is contained or slow-moving." },
  low: { label: "Low severity", hint: "Limited harm; worth recording and watching." },
};

export const ACTION_KIND: Record<ActionKind, string> = {
  site_inspection: "Site inspection",
  sampling: "Sampling",
  enforcement_notice: "Enforcement notice",
  suspension: "Suspension of operations",
  arrest_or_seizure: "Arrest or seizure",
  remediation: "Remediation",
  public_notice: "Public notice",
  referral: "Referral to another institution",
  decision_not_to_act: "Decision not to act",
  other: "Other",
};

export function isOverdue(i: { status: IncidentStatus; dueAt: string | Date | null }) {
  return (
    !!i.dueAt &&
    (i.status === "assigned" || i.status === "in_progress") &&
    new Date(i.dueAt).getTime() < Date.now()
  );
}
