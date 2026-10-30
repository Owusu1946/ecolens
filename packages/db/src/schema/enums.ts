import { pgEnum } from "drizzle-orm/pg-core";

// Risk lenses (brief section 3).
export const lens = pgEnum("lens", ["water", "forest_land", "air"]);

// Confidence categories, never a false-precision score (principle 4).
export const confidence = pgEnum("confidence", ["low", "medium", "high"]);

// Whether data is live, prepared from real sources, or simulated (principle 11).
export const dataMode = pgEnum("data_mode", ["live", "prepared", "simulated"]);

export const institutionKind = pgEnum("institution_kind", [
  "platform",
  "steering",
  "epa",
  "minerals_commission",
  "water_resources_commission",
  "district_assembly",
  "regional_council",
  "research",
  "community",
  "data_provider",
]);

export const sourceKind = pgEnum("source_kind", [
  "satellite",
  "sensor",
  "agency_dataset",
  "regulatory_record",
  "field_observation",
  "model",
]);

export const boundaryKind = pgEnum("boundary_kind", [
  "basin",
  "mining_concession",
  "protected_area",
  "forest_reserve",
  "district",
  "region",
]);

// Alert lifecycle. An alert is a prompt for review (principle 2); only a human
// validation can confirm it, and only a confirmed alert can become an incident.
export const alertStatus = pgEnum("alert_status", [
  "new",
  "in_review",
  "confirmed",
  "rejected",
  "unresolved",
]);

export const validationOutcome = pgEnum("validation_outcome", [
  "confirmed",
  "rejected",
  "unresolved",
]);

export const evidenceKind = pgEnum("evidence_kind", [
  "observation",
  "field_report",
  "imagery",
  "document",
  "note",
]);

export const incidentStatus = pgEnum("incident_status", [
  "open",
  "assigned",
  "in_progress",
  "action_recorded",
  "closed",
]);

export const severity = pgEnum("severity", ["low", "medium", "high"]);

export const incidentActionKind = pgEnum("incident_action_kind", [
  "site_inspection",
  "sampling",
  "enforcement_notice",
  "suspension",
  "arrest_or_seizure",
  "remediation",
  "public_notice",
  "referral",
  "decision_not_to_act",
  "other",
]);

// A request for a field team to check an alert on the ground (Validate).
export const verificationStatus = pgEnum("verification_status", ["open", "fulfilled", "withdrawn"]);

// What a field officer concluded about the alert they were sent to check.
export const fieldAssessment = pgEnum("field_assessment", [
  "supports_alert",
  "contradicts_alert",
  "inconclusive",
]);

export const reportKind = pgEnum("report_kind", [
  "incident_assessment",
  "alert_summary",
  "period_summary",
]);
