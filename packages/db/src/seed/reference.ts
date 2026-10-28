// Reference data for the prototype: institutions, demo people, geography, data
// sources and anomaly rules for the Western Region pilot (Pra and Ankobra).
//
// Everything here is prepared for demonstration. Locations are approximate,
// concession and reserve outlines are illustrative (not authoritative), and all
// readings derived from them are flagged as simulated (brief principle 11).

import type { LineString, MultiPolygon, Point, Polygon, Position } from "../geo";

// --- Institutions (Clerk organizations) --------------------------------------

export type InstitutionKey =
  | "platform"
  | "steering"
  | "epa"
  | "minerals"
  | "wrc"
  | "rcc"
  | "phvma"
  | "tnma"
  | "evaluation";

export const INSTITUTIONS: Record<
  InstitutionKey,
  {
    name: string;
    shortName: string;
    kind:
      | "platform"
      | "steering"
      | "epa"
      | "minerals_commission"
      | "water_resources_commission"
      | "regional_council"
      | "district_assembly"
      | "research";
  }
> = {
  platform: { name: "Ecolens Platform Team", shortName: "Ecolens", kind: "platform" },
  steering: { name: "Ecolens Pilot Steering Group", shortName: "Steering", kind: "steering" },
  epa: {
    name: "Environmental Protection Authority — Western Region",
    shortName: "EPA",
    kind: "epa",
  },
  minerals: { name: "Minerals Commission", shortName: "MinCom", kind: "minerals_commission" },
  wrc: {
    name: "Water Resources Commission",
    shortName: "WRC",
    kind: "water_resources_commission",
  },
  rcc: {
    name: "Western Regional Coordinating Council",
    shortName: "WRCC",
    kind: "regional_council",
  },
  phvma: {
    name: "Prestea-Huni Valley Municipal Assembly",
    shortName: "PHVMA",
    kind: "district_assembly",
  },
  tnma: {
    name: "Tarkwa-Nsuaem Municipal Assembly",
    shortName: "TNMA",
    kind: "district_assembly",
  },
  // Illustrative: the steering group appoints the real evaluator.
  evaluation: {
    name: "Independent Evaluation Team (illustrative)",
    shortName: "Evaluation",
    kind: "research",
  },
};

// --- Demo people: one per role, covering all eight dashboards ----------------
// Fictional names. "+clerk_test" addresses sign in with the Clerk test code
// 424242 in development; no email is sent.

export type PersonKey =
  | "admin"
  | "leadership"
  | "epaRegulator"
  | "epaAnalyst"
  | "epaField"
  | "epaSteward"
  | "mincomRegulator"
  | "wrcRegulator"
  | "phvmaResponder"
  | "tnmaResponder"
  | "rccViewer"
  | "evaluator";

export const PEOPLE: Record<
  PersonKey,
  {
    firstName: string;
    lastName: string;
    email: string;
    institution: InstitutionKey;
    role:
      | "admin"
      | "leadership"
      | "regulator"
      | "data_steward"
      | "analyst"
      | "field_officer"
      | "responder"
      | "viewer"
      | "evaluator";
  }
> = {
  admin: person("Kofi", "Asante", "admin", "platform", "admin"),
  leadership: person("Abena", "Owusu", "leadership", "steering", "leadership"),
  epaRegulator: person("Yaw", "Boateng", "epa.regulator", "epa", "regulator"),
  epaAnalyst: person("Efua", "Mensah", "epa.analyst", "epa", "analyst"),
  epaField: person("Kwame", "Ansah", "epa.field", "epa", "field_officer"),
  epaSteward: person("Akosua", "Darko", "epa.steward", "epa", "data_steward"),
  mincomRegulator: person("Kojo", "Appiah", "mincom.regulator", "minerals", "regulator"),
  wrcRegulator: person("Esi", "Quaye", "wrc.regulator", "wrc", "regulator"),
  phvmaResponder: person("Nana", "Agyeman", "phvma.responder", "phvma", "responder"),
  tnmaResponder: person("Adwoa", "Frimpong", "tnma.responder", "tnma", "responder"),
  rccViewer: person("Kwesi", "Arthur", "wrcc.viewer", "rcc", "viewer"),
  evaluator: person("Ama", "Sarpong", "evaluator", "evaluation", "evaluator"),
};

function person<R extends (typeof PEOPLE)[PersonKey]["role"]>(
  firstName: string,
  lastName: string,
  handle: string,
  institution: InstitutionKey,
  role: R,
) {
  return {
    firstName,
    lastName,
    email: `ecolens.${handle}+clerk_test@example.com`,
    institution,
    role,
  };
}

// --- Geometry helpers --------------------------------------------------------

const KM = 0.009; // ~1 km in degrees near the equator

export const pt = (lon: number, lat: number): Point => ({
  type: "Point",
  coordinates: [lon, lat],
});

export function square(lon: number, lat: number, sizeKm: number): Polygon {
  const h = (sizeKm * KM) / 2;
  return {
    type: "Polygon",
    coordinates: [
      [
        [lon - h, lat - h],
        [lon + h, lat - h],
        [lon + h, lat + h],
        [lon - h, lat + h],
        [lon - h, lat - h],
      ],
    ],
  };
}

const multi = (...polygons: Polygon[]): MultiPolygon => ({
  type: "MultiPolygon",
  coordinates: polygons.map((p) => p.coordinates),
});

const ring = (...coords: Position[]): MultiPolygon => ({
  type: "MultiPolygon",
  coordinates: [[[...coords, coords[0] as Position]]],
});

const line = (...coords: Position[]): LineString => ({ type: "LineString", coordinates: coords });

// --- Data sources (provenance) ----------------------------------------------

export type SourceKey =
  | "s2Turbidity"
  | "epaSampling"
  | "firms"
  | "openaq"
  | "radd"
  | "concessions"
  | "reserves"
  | "hydrography"
  | "fieldReports";

export const SOURCES: Record<
  SourceKey,
  {
    key: string;
    name: string;
    kind:
      | "satellite"
      | "sensor"
      | "agency_dataset"
      | "regulatory_record"
      | "field_observation"
      | "model";
    mode: "live" | "prepared" | "simulated";
    steward: InstitutionKey | null;
    description: string;
    methodology?: string;
    knownLimitations: string;
    spatialResolution?: string;
    updateFrequency?: string;
    licence?: string;
    url?: string;
  }
> = {
  s2Turbidity: {
    key: "sentinel-2-turbidity-proxy",
    name: "Sentinel-2 river turbidity proxy",
    kind: "satellite",
    mode: "simulated",
    steward: "platform",
    description:
      "Estimated surface-water turbidity from Copernicus Sentinel-2 L2A reflectance over monitored river reaches.",
    methodology:
      "Normalised Difference Turbidity Index (red/green bands) over water-masked pixels, converted to an indicative NTU scale against a local baseline.",
    knownLimitations:
      "Optical proxy, not a laboratory measurement. No reading under cloud; haze, sun glint and rainfall runoff can raise values. Narrow channels may mix land pixels.",
    spatialResolution: "10 m",
    updateFrequency: "Every 5 days (cloud permitting)",
    licence: "Copernicus open licence",
    url: "https://dataspace.copernicus.eu",
  },
  epaSampling: {
    key: "epa-water-sampling",
    name: "EPA in-situ water sampling",
    kind: "agency_dataset",
    mode: "simulated",
    steward: "epa",
    description: "Turbidity measured in water samples collected by EPA field officers.",
    methodology: "Grab samples measured with a calibrated field turbidimeter.",
    knownLimitations: "Point measurements on sampling days only; monthly at most sites.",
    updateFrequency: "Monthly",
  },
  firms: {
    key: "nasa-firms-viirs",
    name: "NASA FIRMS active fire / thermal anomalies (VIIRS)",
    kind: "satellite",
    mode: "simulated",
    steward: null,
    description: "Thermal anomalies detected by VIIRS, reported with fire radiative power.",
    knownLimitations:
      "375 m pixels; cannot distinguish machinery, charcoal burning or farm fires. Missed under cloud.",
    spatialResolution: "375 m",
    updateFrequency: "Several times daily",
    licence: "NASA open data",
    url: "https://firms.modaps.eosdis.nasa.gov",
  },
  openaq: {
    key: "openaq-pm25",
    name: "OpenAQ PM2.5 (low-cost sensors)",
    kind: "sensor",
    mode: "simulated",
    steward: null,
    description: "24-hour mean PM2.5 from low-cost sensors near mining towns.",
    knownLimitations:
      "Low-cost sensors over-read in high humidity and are not reference-grade. Data gaps when sensors go offline.",
    updateFrequency: "Hourly, aggregated daily",
    licence: "CC BY 4.0",
    url: "https://openaq.org",
  },
  radd: {
    key: "gfw-radd",
    name: "GFW RADD forest disturbance alerts",
    kind: "satellite",
    mode: "simulated",
    steward: null,
    description: "Radar (Sentinel-1) forest disturbance alerts from Global Forest Watch.",
    knownLimitations:
      "Detects canopy disturbance, not its cause. Minimum mapping unit ~0.1 ha; may lag 1–2 weeks.",
    spatialResolution: "10 m",
    updateFrequency: "Weekly",
    licence: "CC BY 4.0",
    url: "https://www.globalforestwatch.org",
  },
  concessions: {
    key: "mining-concessions-illustrative",
    name: "Mining concessions (illustrative)",
    kind: "regulatory_record",
    mode: "simulated",
    steward: "minerals",
    description:
      "Illustrative concession outlines for the prototype. Real boundaries will come from the Minerals Commission cadastre.",
    knownLimitations:
      "NOT authoritative. Outlines and holders are invented for demonstration and must not be used to judge legality.",
  },
  reserves: {
    key: "forest-reserves-illustrative",
    name: "Forest reserves (illustrative)",
    kind: "regulatory_record",
    mode: "simulated",
    steward: null,
    description: "Approximate forest reserve outlines for the prototype.",
    knownLimitations:
      "NOT authoritative. Simplified shapes near real reserves; official boundaries come from the Forestry Commission.",
  },
  hydrography: {
    key: "rivers-basins-approximate",
    name: "Rivers and basins (approximate)",
    kind: "agency_dataset",
    mode: "prepared",
    steward: "wrc",
    description:
      "Simplified courses of the Ankobra and Pra rivers and their basins in the pilot area.",
    knownLimitations: "Hand-simplified lines and outlines; positional error of several kilometres.",
  },
  fieldReports: {
    key: "ecolens-field-reports",
    name: "Ecolens field reports",
    kind: "field_observation",
    mode: "simulated",
    steward: "epa",
    description: "GPS-tagged observations and photos submitted by authorised field officers.",
    knownLimitations: "Observer judgement; GPS accuracy depends on the device and canopy.",
  },
};

// --- Geography ---------------------------------------------------------------

export const BASINS = [
  {
    name: "Ankobra basin (pilot extent)",
    area: ring(
      [-2.45, 4.85],
      [-2.05, 4.85],
      [-1.85, 5.3],
      [-1.95, 5.95],
      [-2.3, 5.95],
      [-2.4, 5.4],
    ),
  },
  {
    name: "Lower Pra basin (pilot extent)",
    area: ring([-1.85, 4.98], [-1.45, 4.98], [-1.35, 5.7], [-1.7, 5.75], [-1.85, 5.3]),
  },
];

export const REACHES = [
  {
    river: "Ankobra",
    basin: "Ankobra",
    name: "Upper Ankobra",
    course: line([-2.08, 5.78], [-2.04, 5.66], [-2.05, 5.57]),
  },
  {
    river: "Ankobra",
    basin: "Ankobra",
    name: "Middle Ankobra (Prestea)",
    course: line([-2.05, 5.57], [-2.1, 5.49], [-2.14, 5.43], [-2.17, 5.3], [-2.19, 5.18]),
  },
  {
    river: "Ankobra",
    basin: "Ankobra",
    name: "Lower Ankobra (to Axim)",
    course: line([-2.19, 5.18], [-2.22, 5.05], [-2.25, 4.93], [-2.27, 4.88]),
  },
  {
    river: "Bonsa",
    basin: "Ankobra",
    name: "Bonsa (Tarkwa)",
    course: line([-1.95, 5.45], [-2.0, 5.37], [-2.03, 5.33], [-2.1, 5.24], [-2.19, 5.18]),
  },
  {
    river: "Pra",
    basin: "Pra",
    name: "Pra (Twifo Praso)",
    course: line([-1.52, 5.7], [-1.55, 5.61], [-1.58, 5.45], [-1.6, 5.38]),
  },
  {
    river: "Pra",
    basin: "Pra",
    name: "Lower Pra (Daboase to Shama)",
    course: line([-1.6, 5.38], [-1.63, 5.25], [-1.65, 5.15], [-1.66, 5.07], [-1.63, 5.01]),
  },
];

export const RESERVES = [
  { name: "Neung South Forest Reserve (illustrative)", area: multi(square(-1.95, 5.2, 7)) },
  { name: "Bonsa River Forest Reserve (illustrative)", area: multi(square(-1.98, 5.46, 6)) },
];

export const CONCESSIONS = [
  {
    name: "Concession WR-ILL-001",
    reference: "ILL-LS-001",
    holder: "Illustrative large-scale holder A",
    legalStatus: "Valid mining lease (illustrative)",
    area: multi(square(-2.0, 5.28, 4)),
  },
  {
    name: "Concession WR-ILL-002",
    reference: "ILL-LS-002",
    holder: "Illustrative large-scale holder B",
    legalStatus: "Valid mining lease (illustrative)",
    area: multi(square(-2.12, 5.455, 3)),
  },
  {
    name: "Small-scale licence WR-ILL-SS-014",
    reference: "ILL-SS-014",
    holder: "Illustrative small-scale cooperative",
    legalStatus: "Valid small-scale licence (illustrative)",
    area: multi(square(-2.02, 5.55, 1.5)),
  },
  {
    name: "Small-scale licence WR-ILL-SS-022",
    reference: "ILL-SS-022",
    holder: "Illustrative small-scale operator",
    legalStatus: "Licence expired (illustrative)",
    area: multi(square(-1.86, 5.52, 1.5)),
  },
];

// --- Monitoring sites --------------------------------------------------------

export type SiteKey =
  | "ankobraPrestea"
  | "ankobraBonsaConfluence"
  | "ankobraAxim"
  | "bonsaTarkwa"
  | "praTwifoPraso"
  | "praDaboase"
  | "praBeposo"
  | "neungEdge"
  | "bonsaReserve"
  | "tarkwaTown"
  | "presteaTown";

export const SITES: Record<
  SiteKey,
  {
    name: string;
    lens: "water" | "forest_land" | "air";
    basin?: string;
    district: string;
    description: string;
    location: Point;
    baseline?: number; // typical value of the site's main indicator
    isSensitive?: boolean;
  }
> = {
  ankobraPrestea: {
    name: "Ankobra at Prestea",
    lens: "water",
    basin: "Ankobra",
    district: "Prestea-Huni Valley",
    description: "Main channel near Prestea; heavy small-scale mining pressure upstream.",
    location: pt(-2.142, 5.432),
    baseline: 38,
  },
  ankobraBonsaConfluence: {
    name: "Ankobra below Bonsa confluence",
    lens: "water",
    basin: "Ankobra",
    district: "Prestea-Huni Valley",
    description: "Downstream of the Bonsa confluence; integrates Tarkwa catchment runoff.",
    location: pt(-2.19, 5.18),
    baseline: 45,
  },
  ankobraAxim: {
    name: "Ankobra near Axim intake",
    lens: "water",
    basin: "Ankobra",
    district: "Nzema East",
    description: "Lower Ankobra near drinking-water abstraction for Axim.",
    location: pt(-2.25, 4.93),
    baseline: 30,
  },
  bonsaTarkwa: {
    name: "Bonsa River at Tarkwa",
    lens: "water",
    basin: "Ankobra",
    district: "Tarkwa-Nsuaem",
    description: "Bonsa tributary below Tarkwa mining area.",
    location: pt(-2.03, 5.33),
    baseline: 42,
  },
  praTwifoPraso: {
    name: "Pra at Twifo Praso",
    lens: "water",
    basin: "Pra",
    district: "Twifo Atti-Morkwa",
    description: "Upstream reference point on the Pra entering the pilot area.",
    location: pt(-1.55, 5.61),
    baseline: 55,
  },
  praDaboase: {
    name: "Pra at Daboase intake",
    lens: "water",
    basin: "Pra",
    district: "Wassa East",
    description: "Raw-water intake area serving the Sekondi-Takoradi supply.",
    location: pt(-1.65, 5.15),
    baseline: 48,
  },
  praBeposo: {
    name: "Pra at Beposo",
    lens: "water",
    basin: "Pra",
    district: "Shama",
    description: "Lower Pra above the estuary at Shama.",
    location: pt(-1.66, 5.07),
    baseline: 50,
  },
  neungEdge: {
    name: "Neung South reserve edge",
    lens: "forest_land",
    district: "Tarkwa-Nsuaem",
    description: "Southern edge of the reserve, close to recent access tracks.",
    location: pt(-1.93, 5.18),
    isSensitive: true,
  },
  bonsaReserve: {
    name: "Bonsa River reserve interior",
    lens: "forest_land",
    district: "Tarkwa-Nsuaem",
    description: "Reserve interior near the Bonsa headwaters.",
    location: pt(-1.98, 5.47),
    isSensitive: true,
  },
  tarkwaTown: {
    name: "Tarkwa town",
    lens: "air",
    district: "Tarkwa-Nsuaem",
    description: "Low-cost PM2.5 sensor near the town centre.",
    location: pt(-1.99, 5.3),
    baseline: 28,
  },
  presteaTown: {
    name: "Prestea town",
    lens: "air",
    district: "Prestea-Huni Valley",
    description: "Low-cost PM2.5 sensor near the market.",
    location: pt(-2.15, 5.44),
    baseline: 24,
  },
};

// --- Agreed anomaly rules (prototype thresholds, pending scientific review) ---

export const RULES = [
  {
    key: "water.turbidity-spike",
    lens: "water" as const,
    indicator: "turbidity_ntu",
    name: "River turbidity spike",
    description:
      "Turbidity proxy above 3× the site's 90-day median on two consecutive cloud-free passes.",
    params: { multiplier: 3, consecutivePasses: 2, baselineDays: 90 },
  },
  {
    key: "forest.canopy-disturbance",
    lens: "forest_land" as const,
    indicator: "disturbance_area_ha",
    name: "Canopy disturbance in or near a reserve",
    description:
      "RADD disturbance cluster of at least 1 ha inside, or within 1 km of, a forest reserve.",
    params: { minAreaHa: 1, bufferKm: 1 },
  },
  {
    key: "land.disturbance-vs-concession",
    lens: "forest_land" as const,
    indicator: "disturbance_area_ha",
    name: "Land disturbance compared with concessions",
    description:
      "New bare ground or access tracks of at least 0.5 ha, compared with concession boundaries.",
    params: { minAreaHa: 0.5 },
  },
  {
    key: "air.thermal-near-river",
    lens: "air" as const,
    indicator: "frp_mw",
    name: "Thermal anomaly near a river",
    description: "Repeated VIIRS thermal detections within 2 km of a monitored river.",
    params: { bufferKm: 2, minDetections: 2 },
  },
  {
    key: "air.pm25-24h",
    lens: "air" as const,
    indicator: "pm25_ugm3",
    name: "High 24-hour PM2.5",
    description: "24-hour mean PM2.5 above 35 µg/m³ on two consecutive days (prototype threshold).",
    params: { threshold: 35, consecutiveDays: 2 },
  },
];
