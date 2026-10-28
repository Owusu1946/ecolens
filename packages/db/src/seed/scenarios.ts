// Alert storylines for the demo. Each one walks part or all of the operating
// model (Observe → Analyse → Interpret → Validate → Escalate → Report), so every
// screen, status and MEL measure has realistic data. Times are relative to when
// the seed runs, so the data always looks current.

import type { Geometry } from "../geo";
import type { InstitutionKey, PersonKey, SiteKey } from "./reference";
import { square } from "./reference";

type Confidence = "low" | "medium" | "high";

export type Scenario = {
  key: string;
  site: SiteKey;
  rule: string;
  lens: "water" | "forest_land" | "air";
  indicator: string;
  title: string;
  summary: string;
  confidence: Confidence;
  // Peak value of the triggering reading, in the indicator's unit.
  peak: number;
  // Alert geometry when it differs from the site point (e.g. a disturbance patch).
  area?: Geometry;
  coverage: string;
  limitations: string;
  detectedDaysAgo: number;
  // Hours between the first anomalous observation and the alert (detection latency).
  latencyHours: number;
  isSensitive?: boolean;
  review?: { by: PersonKey; afterHours: number };
  fieldReport?: {
    by: PersonKey;
    afterHours: number;
    assessment: "supports_alert" | "contradicts_alert" | "inconclusive";
    observation: string;
    activityTypes: string[];
    photos: number;
  };
  validation?: {
    by: PersonKey;
    afterHours: number;
    outcome: "confirmed" | "rejected" | "unresolved";
    confidence: Confidence;
    rationale: string;
  };
  incident?: {
    by: PersonKey;
    afterHours: number;
    title: string;
    severity: "low" | "medium" | "high";
    responsible: InstitutionKey;
    assignments: {
      to: InstitutionKey;
      by: PersonKey;
      afterHours: number;
      dueInDays: number;
      instructions: string;
    }[];
    actions: {
      by: PersonKey;
      afterHours: number;
      kind:
        | "site_inspection"
        | "sampling"
        | "enforcement_notice"
        | "suspension"
        | "arrest_or_seizure"
        | "remediation"
        | "public_notice"
        | "referral"
        | "decision_not_to_act"
        | "other";
      description: string;
    }[];
    close?: { by: PersonKey; afterHours: number; summary: string };
  };
};

const S2_COVERAGE = "Sentinel-2 L2A, 10 m; two cloud-free passes in the last 10 days";
const S2_LIMITS =
  "Optical proxy, not a laboratory measurement. Rainfall runoff and haze can raise values.";
const RADD_COVERAGE = "Sentinel-1 radar, weekly; unaffected by cloud";
const RADD_LIMITS = "Shows canopy loss, not its cause. Outline accurate to about 10–20 m.";
const FIRMS_COVERAGE = "VIIRS 375 m, night and day passes";
const FIRMS_LIMITS = "Cannot tell machinery or mining from farm or charcoal fires.";
const AQ_COVERAGE = "One low-cost sensor; 22 of 24 hourly readings available";
const AQ_LIMITS = "Not reference-grade; humidity can inflate readings.";

export const SCENARIOS: Scenario[] = [
  // --- Closed: full lifecycle, oldest first (gives response-speed history) ----
  {
    key: "ankobra-prestea-aug",
    site: "ankobraPrestea",
    rule: "water.turbidity-spike",
    lens: "water",
    indicator: "turbidity_ntu",
    title: "Turbidity spike on the Ankobra at Prestea",
    summary:
      "Turbidity proxy rose to about 26× the local baseline over two passes, consistent with sediment discharge upstream.",
    confidence: "high",
    peak: 980,
    coverage: S2_COVERAGE,
    limitations: S2_LIMITS,
    detectedDaysAgo: 74,
    latencyHours: 30,
    review: { by: "epaAnalyst", afterHours: 3 },
    fieldReport: {
      by: "epaField",
      afterHours: 26,
      assessment: "supports_alert",
      observation:
        "River brown and opaque below the Prestea bridge. Two changfan dredges active about 1.2 km upstream; sediment plume visible.",
      activityTypes: ["dredging", "sediment_plume"],
      photos: 3,
    },
    validation: {
      by: "epaAnalyst",
      afterHours: 30,
      outcome: "confirmed",
      confidence: "high",
      rationale:
        "Satellite signal confirmed by field visit and photos; dredging observed upstream of the site.",
    },
    incident: {
      by: "epaRegulator",
      afterHours: 34,
      title: "Suspected dredging upstream of Prestea (Ankobra)",
      severity: "high",
      responsible: "phvma",
      assignments: [
        {
          to: "phvma",
          by: "epaRegulator",
          afterHours: 36,
          dueInDays: 7,
          instructions:
            "Coordinate a joint site visit with the Minerals Commission and district security.",
        },
        {
          to: "minerals",
          by: "epaRegulator",
          afterHours: 36,
          dueInDays: 7,
          instructions: "Check licence status of any operators found at the site.",
        },
      ],
      actions: [
        {
          by: "phvmaResponder",
          afterHours: 70,
          kind: "site_inspection",
          description: "Joint team visited the site; two dredges found, operators unlicensed.",
        },
        {
          by: "phvmaResponder",
          afterHours: 74,
          kind: "arrest_or_seizure",
          description: "Equipment impounded by district security; matter referred to police.",
        },
      ],
      close: {
        by: "epaRegulator",
        afterHours: 21 * 24,
        summary:
          "Activity stopped and equipment seized. Turbidity returned to baseline on the next two clear passes.",
      },
    },
  },
  {
    key: "bonsa-access-route",
    site: "bonsaTarkwa",
    rule: "land.disturbance-vs-concession",
    lens: "forest_land",
    indicator: "disturbance_area_ha",
    title: "New access track and bare ground outside any concession",
    summary:
      "About 3.4 ha of new bare ground and a 1.8 km track between Tarkwa and Prestea, outside mapped concessions.",
    confidence: "high",
    peak: 3.4,
    area: square(-2.06, 5.36, 0.4),
    coverage: RADD_COVERAGE,
    limitations: `${RADD_LIMITS} Concession outlines are illustrative.`,
    detectedDaysAgo: 52,
    latencyHours: 96,
    review: { by: "epaAnalyst", afterHours: 5 },
    fieldReport: {
      by: "epaField",
      afterHours: 40,
      assessment: "supports_alert",
      observation:
        "Fresh pits and an excavator at the end of a new laterite track. No signboard or licence displayed.",
      activityTypes: ["excavation", "access_track", "heavy_machinery"],
      photos: 4,
    },
    validation: {
      by: "mincomRegulator",
      afterHours: 46,
      outcome: "confirmed",
      confidence: "high",
      rationale:
        "Disturbance lies outside all registered concessions; field team saw active excavation.",
    },
    incident: {
      by: "mincomRegulator",
      afterHours: 48,
      title: "Unlicensed excavation between Tarkwa and Prestea",
      severity: "high",
      responsible: "minerals",
      assignments: [
        {
          to: "tnma",
          by: "mincomRegulator",
          afterHours: 50,
          dueInDays: 5,
          instructions: "Stop work and secure the site with district security.",
        },
      ],
      actions: [
        {
          by: "tnmaResponder",
          afterHours: 80,
          kind: "suspension",
          description: "Work stopped; operators instructed to leave the site.",
        },
        {
          by: "mincomRegulator",
          afterHours: 10 * 24,
          kind: "remediation",
          description: "Pits backfilled under supervision; reclamation plan requested.",
        },
      ],
      close: {
        by: "mincomRegulator",
        afterHours: 30 * 24,
        summary:
          "Site stopped and partly reclaimed. Follow-up RADD checks show no new disturbance.",
      },
    },
  },
  {
    key: "pra-twifo-referral",
    site: "praTwifoPraso",
    rule: "water.turbidity-spike",
    lens: "water",
    indicator: "turbidity_ntu",
    title: "Elevated turbidity entering the pilot area on the Pra",
    summary:
      "Turbidity at Twifo Praso about 4× baseline; the source appears to be upstream of the pilot area.",
    confidence: "medium",
    peak: 230,
    coverage: S2_COVERAGE,
    limitations: S2_LIMITS,
    detectedDaysAgo: 40,
    latencyHours: 52,
    review: { by: "epaAnalyst", afterHours: 8 },
    validation: {
      by: "wrcRegulator",
      afterHours: 30,
      outcome: "confirmed",
      confidence: "medium",
      rationale:
        "Pattern persists across three passes and is visible upstream; not explained by rainfall.",
    },
    incident: {
      by: "wrcRegulator",
      afterHours: 32,
      title: "Upstream sediment load on the Pra",
      severity: "medium",
      responsible: "wrc",
      assignments: [
        {
          to: "wrc",
          by: "wrcRegulator",
          afterHours: 33,
          dueInDays: 14,
          instructions: "Notify the basin office upstream and share the evidence pack.",
        },
      ],
      actions: [
        {
          by: "wrcRegulator",
          afterHours: 60,
          kind: "referral",
          description:
            "Referred to the Pra basin office and EPA Ashanti; outside pilot jurisdiction.",
        },
      ],
      close: {
        by: "wrcRegulator",
        afterHours: 9 * 24,
        summary: "Referred upstream with evidence; no further action within the pilot area.",
      },
    },
  },

  // --- Open incidents ---------------------------------------------------------
  {
    key: "pra-daboase-intake",
    site: "praDaboase",
    rule: "water.turbidity-spike",
    lens: "water",
    indicator: "turbidity_ntu",
    title: "Turbidity rising at the Daboase intake",
    summary:
      "Turbidity proxy about 9× baseline near the raw-water intake for Sekondi-Takoradi; treatment costs likely to rise.",
    confidence: "high",
    peak: 430,
    coverage: S2_COVERAGE,
    limitations: S2_LIMITS,
    detectedDaysAgo: 9,
    latencyHours: 20,
    review: { by: "epaAnalyst", afterHours: 2 },
    fieldReport: {
      by: "epaField",
      afterHours: 22,
      assessment: "supports_alert",
      observation:
        "Water visibly turbid at the intake. Sample taken; reading 410 NTU on the field meter.",
      activityTypes: ["sediment_plume"],
      photos: 2,
    },
    validation: {
      by: "wrcRegulator",
      afterHours: 26,
      outcome: "confirmed",
      confidence: "high",
      rationale:
        "Field sample agrees with the satellite estimate; intake operator reports the same.",
    },
    incident: {
      by: "wrcRegulator",
      afterHours: 28,
      title: "Sediment load threatening the Daboase water intake",
      severity: "high",
      responsible: "wrc",
      assignments: [
        {
          to: "wrc",
          by: "wrcRegulator",
          afterHours: 29,
          dueInDays: 10,
          instructions:
            "Trace the source upstream with EPA and agree interim measures with the water utility.",
        },
      ],
      actions: [
        {
          by: "epaField",
          afterHours: 4 * 24,
          kind: "sampling",
          description:
            "Three samples taken along 15 km upstream; highest reading below Beposo junction.",
        },
      ],
    },
  },
  {
    key: "neung-canopy",
    site: "neungEdge",
    rule: "forest.canopy-disturbance",
    lens: "forest_land",
    indicator: "disturbance_area_ha",
    title: "Canopy loss at the edge of Neung South reserve",
    summary:
      "About 6.1 ha of canopy loss inside the reserve edge over three weeks, with a new track.",
    confidence: "high",
    peak: 6.1,
    area: square(-1.93, 5.18, 0.5),
    coverage: RADD_COVERAGE,
    limitations: `${RADD_LIMITS} Reserve outline is illustrative.`,
    detectedDaysAgo: 6,
    latencyHours: 130,
    isSensitive: true,
    review: { by: "epaAnalyst", afterHours: 6 },
    validation: {
      by: "epaRegulator",
      afterHours: 20,
      outcome: "confirmed",
      confidence: "medium",
      rationale:
        "Consistent radar signal over three weeks and visible clearing on optical imagery; field visit scheduled.",
    },
    incident: {
      by: "epaRegulator",
      afterHours: 24,
      title: "Suspected mining encroachment into Neung South reserve",
      severity: "medium",
      responsible: "tnma",
      assignments: [
        {
          to: "tnma",
          by: "epaRegulator",
          afterHours: 26,
          dueInDays: 7,
          instructions: "Arrange a site visit with forestry staff; do not publish the location.",
        },
      ],
      actions: [],
    },
  },

  // --- Rejected (false-alert rate) ---------------------------------------------
  {
    key: "ankobra-rainfall",
    site: "ankobraBonsaConfluence",
    rule: "water.turbidity-spike",
    lens: "water",
    indicator: "turbidity_ntu",
    title: "Turbidity increase below the Bonsa confluence",
    summary: "Turbidity proxy about 3.5× baseline after a wet week.",
    confidence: "low",
    peak: 160,
    coverage: S2_COVERAGE,
    limitations: S2_LIMITS,
    detectedDaysAgo: 33,
    latencyHours: 44,
    review: { by: "epaAnalyst", afterHours: 4 },
    fieldReport: {
      by: "epaField",
      afterHours: 30,
      assessment: "contradicts_alert",
      observation:
        "Heavy rain for three days. Water brown across the whole catchment; no mining activity seen near the river.",
      activityTypes: ["none_observed"],
      photos: 2,
    },
    validation: {
      by: "epaAnalyst",
      afterHours: 34,
      outcome: "rejected",
      confidence: "high",
      rationale:
        "Rainfall runoff explains the rise; similar increase on undisturbed tributaries. Rule to be tuned for rain.",
    },
  },
  {
    key: "thermal-farm-fire",
    site: "ankobraPrestea",
    rule: "air.thermal-near-river",
    lens: "air",
    indicator: "frp_mw",
    title: "Thermal anomalies near the Ankobra",
    summary: "Three VIIRS detections within 2 km of the river over two nights.",
    confidence: "low",
    peak: 14,
    coverage: FIRMS_COVERAGE,
    limitations: FIRMS_LIMITS,
    detectedDaysAgo: 21,
    latencyHours: 8,
    review: { by: "epaAnalyst", afterHours: 3 },
    fieldReport: {
      by: "epaField",
      afterHours: 28,
      assessment: "contradicts_alert",
      observation: "Burnt farm plots being cleared for planting. No machinery or pits.",
      activityTypes: ["farm_burning"],
      photos: 1,
    },
    validation: {
      by: "epaAnalyst",
      afterHours: 30,
      outcome: "rejected",
      confidence: "high",
      rationale: "Agricultural burning confirmed in the field.",
    },
  },
  {
    key: "inside-concession",
    site: "bonsaTarkwa",
    rule: "land.disturbance-vs-concession",
    lens: "forest_land",
    indicator: "disturbance_area_ha",
    title: "New bare ground near Bogoso",
    summary: "About 1.2 ha of new bare ground north of Prestea.",
    confidence: "medium",
    peak: 1.2,
    area: square(-2.018, 5.552, 0.25),
    coverage: RADD_COVERAGE,
    limitations: `${RADD_LIMITS} Concession outlines are illustrative.`,
    detectedDaysAgo: 15,
    latencyHours: 120,
    review: { by: "mincomRegulator", afterHours: 10 },
    validation: {
      by: "mincomRegulator",
      afterHours: 18,
      outcome: "rejected",
      confidence: "high",
      rationale:
        "Disturbance is inside small-scale licence WR-ILL-SS-014, which is valid, and matches the approved work plan.",
    },
  },

  // --- Unresolved ----------------------------------------------------------------
  {
    key: "tarkwa-pm25",
    site: "tarkwaTown",
    rule: "air.pm25-24h",
    lens: "air",
    indicator: "pm25_ugm3",
    title: "High PM2.5 in Tarkwa",
    summary: "24-hour PM2.5 above 35 µg/m³ on two consecutive days.",
    confidence: "low",
    peak: 61,
    coverage: AQ_COVERAGE,
    limitations: AQ_LIMITS,
    detectedDaysAgo: 12,
    latencyHours: 26,
    review: { by: "epaAnalyst", afterHours: 6 },
    validation: {
      by: "epaAnalyst",
      afterHours: 72,
      outcome: "unresolved",
      confidence: "low",
      rationale:
        "Single low-cost sensor and high humidity; no reference station nearby. Needs a second sensor before deciding.",
    },
  },

  // --- In review -------------------------------------------------------------------
  {
    key: "bonsa-turbidity",
    site: "bonsaTarkwa",
    rule: "water.turbidity-spike",
    lens: "water",
    indicator: "turbidity_ntu",
    title: "Turbidity spike on the Bonsa at Tarkwa",
    summary: "Turbidity proxy about 11× baseline on two consecutive passes.",
    confidence: "medium",
    peak: 470,
    coverage: S2_COVERAGE,
    limitations: S2_LIMITS,
    detectedDaysAgo: 3,
    latencyHours: 18,
    review: { by: "epaAnalyst", afterHours: 4 },
  },
  {
    key: "bonsa-reserve-canopy",
    site: "bonsaReserve",
    rule: "forest.canopy-disturbance",
    lens: "forest_land",
    indicator: "disturbance_area_ha",
    title: "Canopy loss inside Bonsa River reserve",
    summary: "About 2.3 ha of canopy disturbance in the reserve interior.",
    confidence: "medium",
    peak: 2.3,
    area: square(-1.98, 5.47, 0.3),
    coverage: RADD_COVERAGE,
    limitations: `${RADD_LIMITS} Reserve outline is illustrative.`,
    detectedDaysAgo: 2,
    latencyHours: 150,
    isSensitive: true,
    review: { by: "epaAnalyst", afterHours: 10 },
  },

  // --- New: waiting in the queue ------------------------------------------------------
  {
    key: "pra-beposo",
    site: "praBeposo",
    rule: "water.turbidity-spike",
    lens: "water",
    indicator: "turbidity_ntu",
    title: "Turbidity spike on the lower Pra at Beposo",
    summary: "Turbidity proxy about 8× baseline on two consecutive passes.",
    confidence: "high",
    peak: 400,
    coverage: S2_COVERAGE,
    limitations: S2_LIMITS,
    detectedDaysAgo: 1,
    latencyHours: 16,
  },
  {
    key: "ankobra-axim",
    site: "ankobraAxim",
    rule: "water.turbidity-spike",
    lens: "water",
    indicator: "turbidity_ntu",
    title: "Turbidity rising near the Axim intake",
    summary: "Turbidity proxy about 4× baseline near drinking-water abstraction.",
    confidence: "medium",
    peak: 125,
    coverage: S2_COVERAGE,
    limitations: S2_LIMITS,
    detectedDaysAgo: 0.25,
    latencyHours: 14,
  },
  {
    key: "prestea-thermal",
    site: "presteaTown",
    rule: "air.thermal-near-river",
    lens: "air",
    indicator: "frp_mw",
    title: "Night-time thermal anomalies west of Prestea",
    summary: "Two VIIRS detections close to the Ankobra on consecutive nights.",
    confidence: "low",
    peak: 9,
    coverage: FIRMS_COVERAGE,
    limitations: FIRMS_LIMITS,
    detectedDaysAgo: 0.6,
    latencyHours: 10,
  },
  {
    key: "prestea-pm25",
    site: "presteaTown",
    rule: "air.pm25-24h",
    lens: "air",
    indicator: "pm25_ugm3",
    title: "High PM2.5 in Prestea",
    summary: "24-hour PM2.5 above 35 µg/m³ on two consecutive days near the market.",
    confidence: "medium",
    peak: 48,
    coverage: AQ_COVERAGE,
    limitations: AQ_LIMITS,
    detectedDaysAgo: 1.5,
    latencyHours: 24,
  },
];
