import type { Database } from "@ecolens/db";
import {
  alertEvidence,
  alerts,
  anomalyRules,
  auditEvents,
  dataSources,
  institutions,
  observations,
} from "@ecolens/db/schema/index";
import { and, desc, eq, sql } from "drizzle-orm";

// Observe → Analyse with a live source (brief section 4; docs/stack.md,
// "Ingestion"). NASA FIRMS VIIRS thermal detections for the pilot area are
// stored as live observations, then the agreed rule "Thermal anomaly near a
// river" is evaluated over them. Alerts it opens are prompts for review:
// VIIRS cannot tell machinery or mining from farm or charcoal fires
// (principle 2), so they start at low confidence.

// Western Region pilot area (west, south, east, north).
export const PILOT_BBOX = [-3.1, 4.7, -1.4, 6.5] as const;
const PRODUCTS = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"] as const;
const DAY_RANGE = 2;
const RULE_KEY = "air.thermal-near-river";
const SYSTEM_USER = "system:analysis";

// A live source of its own, so live and prepared data are never mixed
// (principle 11) and each reading shows where it came from (principle 3).
const SOURCE = {
  key: "nasa-firms-viirs-nrt",
  name: "NASA FIRMS VIIRS thermal anomalies (near real time)",
  kind: "satellite" as const,
  mode: "live" as const,
  description:
    "Active fire and thermal anomaly detections from VIIRS on Suomi NPP, NOAA-20 and NOAA-21, fetched from NASA FIRMS for the pilot area.",
  methodology:
    "Detections are fetched hourly; each is one 375 m pixel with fire radiative power (FRP).",
  knownLimitations:
    "375 m pixels; cannot distinguish machinery, mining, charcoal burning or farm fires. Missed under cloud; a pass every few hours.",
  spatialResolution: "375 m",
  updateFrequency: "Hourly fetch; passes several times daily",
  licence: "NASA open data (FIRMS)",
  url: "https://firms.modaps.eosdis.nasa.gov",
};

export type FirmsDetection = {
  latitude: number;
  longitude: number;
  frp: number;
  confidence: "low" | "medium" | "high";
  observedAt: Date;
  satellite: string;
  daynight: string;
  raw: Record<string, string>;
};

/** Parse a FIRMS area CSV (VIIRS columns). Unparseable rows are skipped. */
export function parseFirmsCsv(text: string): FirmsDetection[] {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift()?.split(",") ?? [];
  if (!header.includes("latitude")) return [];
  const conf = { l: "low", n: "medium", h: "high" } as const;
  return lines.flatMap((line) => {
    const cells = line.split(",");
    const raw = Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
    const latitude = Number(raw.latitude);
    const longitude = Number(raw.longitude);
    const frp = Number(raw.frp);
    const time = (raw.acq_time ?? "").padStart(4, "0");
    const observedAt = new Date(`${raw.acq_date}T${time.slice(0, 2)}:${time.slice(2)}:00Z`);
    if (![latitude, longitude, frp].every(Number.isFinite) || Number.isNaN(observedAt.getTime())) {
      return [];
    }
    return [
      {
        latitude,
        longitude,
        frp,
        confidence: conf[raw.confidence as keyof typeof conf] ?? "medium",
        observedAt,
        satellite: raw.satellite ?? "",
        daynight: raw.daynight ?? "",
        raw,
      },
    ];
  });
}

/** Fetch the last two days of VIIRS detections for the pilot area. */
export async function fetchFirms(mapKey: string, fetcher: typeof fetch = fetch) {
  const bbox = PILOT_BBOX.join(",");
  const all: FirmsDetection[] = [];
  for (const product of PRODUCTS) {
    const res = await fetcher(
      `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/${product}/${bbox}/${DAY_RANGE}`,
    );
    if (!res.ok) throw new Error(`FIRMS ${product}: ${res.status} ${await res.text()}`);
    const text = await res.text();
    // FIRMS answers some errors with 200 and a plain message.
    if (!text.startsWith("latitude")) throw new Error(`FIRMS ${product}: ${text.slice(0, 200)}`);
    all.push(...parseFirmsCsv(text));
  }
  return all;
}

async function liveSource(db: Database) {
  await db.insert(dataSources).values(SOURCE).onConflictDoNothing({ target: dataSources.key });
  const [row] = await db
    .select({ id: dataSources.id })
    .from(dataSources)
    .where(eq(dataSources.key, SOURCE.key));
  if (!row) throw new Error("FIRMS data source missing");
  return row.id;
}

/** Store detections as observations; repeats are ignored. Returns how many were new. */
export async function storeDetections(db: Database, detections: FirmsDetection[]) {
  const sourceId = await liveSource(db);
  if (detections.length === 0) return { sourceId, stored: 0 };
  const inserted = await db
    .insert(observations)
    .values(
      detections.map((d) => ({
        sourceId,
        lens: "air" as const,
        indicator: "frp_mw",
        value: d.frp,
        unit: "MW",
        observedAt: d.observedAt,
        location: {
          type: "Point" as const,
          coordinates: [d.longitude, d.latitude] as [number, number],
        },
        confidence: d.confidence,
        qualityNote: `${d.satellite} ${d.daynight === "N" ? "night" : "day"} pass`,
        externalId: `${d.satellite}-${d.raw.acq_date}-${d.raw.acq_time}-${d.latitude.toFixed(5)}-${d.longitude.toFixed(5)}`,
        raw: d.raw,
        isSimulated: false,
      })),
    )
    .onConflictDoNothing({ target: [observations.sourceId, observations.externalId] })
    .returning({ id: observations.id });
  return { sourceId, stored: inserted.length };
}

type Cluster = {
  ids: string[];
  n: number;
  first: Date;
  last: Date;
  peak: number;
  lng: number;
  lat: number;
  river: string;
  distance_m: number;
};

/**
 * Evaluate "Thermal anomaly near a river" over unassigned live detections:
 * clusters of at least `minDetections` within 1 km of each other and within
 * `bufferKm` of a river reach. A cluster near an open alert from the same rule
 * adds to it; otherwise it opens a new alert.
 */
export async function evaluateThermalRule(db: Database, sourceId: string, now = new Date()) {
  const [rule] = await db
    .select()
    .from(anomalyRules)
    .where(and(eq(anomalyRules.key, RULE_KEY), eq(anomalyRules.isActive, true)))
    .orderBy(desc(anomalyRules.version))
    .limit(1);
  if (!rule) return { opened: [], extended: [] };
  const params = rule.params as { bufferKm?: number; minDetections?: number };
  const bufferM = (params.bufferKm ?? 2) * 1000;
  const minDetections = params.minDetections ?? 2;

  const result = await db.execute(sql`
    with recent as (
      select o.id, o.location, o.observed_at, o.value
      from observations o
      where o.source_id = ${sourceId} and o.indicator = 'frp_mw'
        and o.observed_at >= ${now}::timestamptz - interval '72 hours'
        and not exists (select 1 from alert_evidence e where e.observation_id = o.id)
        and exists (select 1 from river_reaches r
          where st_dwithin(r.course::geography, o.location::geography, ${bufferM}))
    ), clustered as (
      select *, st_clusterdbscan(st_transform(location, 32630), eps := 1000, minpoints := 1) over () as cid
      from recent
    ), groups as (
      select cid, array_agg(id::text) as ids, count(*)::int as n, min(observed_at) as first,
        max(observed_at) as last, max(value) as peak, st_centroid(st_collect(location)) as centre
      from clustered group by cid having count(*) >= ${minDetections}
    )
    select g.ids, g.n, g.first, g.last, g.peak, st_x(g.centre) as lng, st_y(g.centre) as lat,
      r.river, st_distance(r.course::geography, g.centre::geography) as distance_m
    from groups g
    cross join lateral (
      select river, course from river_reaches order by course <-> g.centre limit 1
    ) r`);
  const clusters = ((Array.isArray(result) ? result[0]?.rows : result.rows) ?? []) as Cluster[];

  const [platform] = await db
    .select({ clerkOrgId: institutions.clerkOrgId })
    .from(institutions)
    .where(eq(institutions.kind, "platform"))
    .limit(1);
  const systemOrg = platform?.clerkOrgId ?? "platform";

  const opened: string[] = [];
  const extended: string[] = [];
  for (const row of clusters) {
    // Driver-dependent: timestamps may arrive as strings.
    const c = { ...row, first: new Date(row.first), last: new Date(row.last) };
    const centre = {
      type: "Point" as const,
      coordinates: [Number(c.lng), Number(c.lat)] as [number, number],
    };
    await db.transaction(async (tx) => {
      // An open alert from this rule within 2 km in the last week: add to it.
      const [existing] = await tx
        .select({ id: alerts.id })
        .from(alerts)
        .where(
          sql`${alerts.ruleId} = ${rule.id} and ${alerts.status} in ('new', 'in_review', 'unresolved')
            and ${alerts.detectedAt} >= ${now}::timestamptz - interval '7 days'
            and st_dwithin(${alerts.location}::geography, st_setsrid(st_makepoint(${centre.coordinates[0]}, ${centre.coordinates[1]}), 4326)::geography, 2000)`,
        )
        .limit(1);

      let alertId = existing?.id;
      if (!alertId) {
        const [site] = await tx
          .execute(sql`
          select id from sites
          where st_dwithin(location::geography, st_setsrid(st_makepoint(${centre.coordinates[0]}, ${centre.coordinates[1]}), 4326)::geography, 5000)
          order by location <-> st_setsrid(st_makepoint(${centre.coordinates[0]}, ${centre.coordinates[1]}), 4326) limit 1`)
          .then((r) => (Array.isArray(r) ? r[0]?.rows : r.rows) ?? []);
        const km = (Number(c.distance_m) / 1000).toFixed(1);
        const [created] = await tx
          .insert(alerts)
          .values({
            lens: "air",
            indicator: "frp_mw",
            title: `Thermal anomalies near the ${c.river}`,
            summary: `${c.n} VIIRS thermal detections about ${km} km from the ${c.river} between ${c.first.toISOString().slice(0, 16).replace("T", " ")} and ${c.last.toISOString().slice(0, 16).replace("T", " ")} UTC; peak fire radiative power ${Number(c.peak).toFixed(1)} MW.`,
            ruleId: rule.id,
            siteId: (site?.id as string | undefined) ?? null,
            location: centre,
            // VIIRS can't tell what is burning; more detections raise it a step.
            confidence: c.n >= 4 ? "medium" : "low",
            coverage: "VIIRS 375 m (Suomi NPP, NOAA-20, NOAA-21), live from NASA FIRMS",
            limitations: SOURCE.knownLimitations,
            firstObservedAt: c.first,
            detectedAt: now,
            isSimulated: false,
          })
          .returning({ id: alerts.id });
        if (!created) throw new Error("alert insert failed");
        alertId = created.id;
        opened.push(alertId);
        await tx.insert(auditEvents).values({
          occurredAt: now,
          actorUserId: SYSTEM_USER,
          actorOrgId: systemOrg,
          actorRole: "system",
          action: "alert.detect",
          entityType: "alert",
          entityId: alertId,
          toStatus: "new",
          reason: `Rule ${RULE_KEY} v${rule.version} triggered by ${c.n} live FIRMS detections`,
          entityVersion: 1,
          data: { source: SOURCE.key, detections: c.n },
        });
      } else {
        extended.push(alertId);
      }
      await tx.insert(alertEvidence).values(
        c.ids.map((observationId) => ({
          alertId: alertId as string,
          kind: "observation" as const,
          observationId,
          addedByUserId: SYSTEM_USER,
          addedAt: now,
        })),
      );
    });
  }
  return { opened, extended };
}

/** One ingestion run: fetch, store, evaluate. */
export async function runFirms(
  db: Database,
  mapKey: string,
  fetcher: typeof fetch = fetch,
  now = new Date(),
) {
  const detections = await fetchFirms(mapKey, fetcher);
  const { sourceId, stored } = await storeDetections(db, detections);
  const { opened, extended } = await evaluateThermalRule(db, sourceId, now);
  return { fetched: detections.length, stored, opened: opened.length, extended: extended.length };
}
