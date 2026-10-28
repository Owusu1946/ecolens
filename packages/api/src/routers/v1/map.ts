import type { Geometry, LineString, MultiPolygon, Point } from "@ecolens/db/geo";

export type { Geometry, Position } from "@ecolens/db/geo";

import { alerts, boundaries, sites } from "@ecolens/db/schema/index";
import { eq } from "drizzle-orm";

import { hasPermission } from "../../auth/roles";
import { authorizedProcedure } from "../../index";

// Map data (Interpret): every layer comes with its provenance (principle 3),
// and sensitive locations are withheld from roles without
// `sensitive_location:read` (principle 6). Responses say how many features
// were withheld, so the map tells the user instead of hiding it silently.

type Feature<G extends Geometry, P> = { type: "Feature"; id: string; geometry: G; properties: P };
export type FeatureCollection<G extends Geometry, P> = {
  type: "FeatureCollection";
  features: Feature<G, P>[];
};

function collection<G extends Geometry, P extends { id: string }>(
  rows: { geometry: G; properties: P }[],
): FeatureCollection<G, P> {
  return {
    type: "FeatureCollection",
    features: rows.map((r) => ({ type: "Feature", id: r.properties.id, ...r })),
  };
}

// The newest alerts are enough for the map; the alert queue pages through all of them.
const ALERT_LIMIT = 500;

export const mapRouter = {
  // Reference geography and the sources behind it. Changes rarely.
  layers: authorizedProcedure("alert:read").handler(async ({ context: { db, actor } }) => {
    const sensitive = hasPermission(actor.role, "sensitive_location:read");
    // Drizzle rejects `where: undefined`, so the filter is only added when it applies.
    const visible = sensitive ? {} : { where: { isSensitive: false } };

    const [sources, boundaryRows, reachRows, siteRows, hiddenBoundaries, hiddenSites] =
      await Promise.all([
        db.query.dataSources.findMany({
          columns: {
            key: true,
            name: true,
            kind: true,
            mode: true,
            description: true,
            methodology: true,
            knownLimitations: true,
            spatialResolution: true,
            updateFrequency: true,
            licence: true,
            url: true,
          },
          with: { steward: { columns: { name: true, shortName: true } } },
          orderBy: { name: "asc" },
        }),
        db.query.boundaries.findMany({
          ...visible,
          columns: {
            id: true,
            kind: true,
            name: true,
            reference: true,
            holder: true,
            legalStatus: true,
            validFrom: true,
            area: true,
          },
          with: { source: { columns: { key: true } } },
        }),
        db.query.riverReaches.findMany({
          columns: { id: true, river: true, basin: true, name: true, course: true },
          with: { source: { columns: { key: true } } },
        }),
        db.query.sites.findMany({
          ...visible,
          columns: {
            id: true,
            name: true,
            lens: true,
            basin: true,
            district: true,
            location: true,
            isSimulated: true,
          },
        }),
        sensitive ? 0 : db.$count(boundaries, eq(boundaries.isSensitive, true)),
        sensitive ? 0 : db.$count(sites, eq(sites.isSensitive, true)),
      ]);

    return {
      sources: sources.map(({ steward, ...s }) => ({ ...s, steward: steward ?? null })),
      boundaries: collection<MultiPolygon, BoundaryProps>(
        boundaryRows.map(({ area, source, ...b }) => ({
          geometry: area,
          properties: { ...b, sourceKey: source.key },
        })),
      ),
      reaches: collection<LineString, ReachProps>(
        reachRows.map(({ course, source, ...r }) => ({
          geometry: course,
          properties: { ...r, sourceKey: source.key },
        })),
      ),
      sites: collection<Point, SiteProps>(
        siteRows.map(({ location, ...s }) => ({ geometry: location, properties: s })),
      ),
      withheld: hiddenBoundaries + hiddenSites,
    };
  }),

  // Alerts for the map, newest first, each with what it rests on.
  alerts: authorizedProcedure("alert:read").handler(async ({ context: { db, actor } }) => {
    const sensitive = hasPermission(actor.role, "sensitive_location:read");

    const [rows, withheld] = await Promise.all([
      db.query.alerts.findMany({
        ...(sensitive ? {} : { where: { isSensitive: false } }),
        columns: {
          id: true,
          number: true,
          lens: true,
          indicator: true,
          title: true,
          summary: true,
          confidence: true,
          status: true,
          coverage: true,
          limitations: true,
          firstObservedAt: true,
          detectedAt: true,
          isSimulated: true,
          location: true,
        },
        with: {
          site: { columns: { name: true, basin: true } },
          rule: { columns: { name: true, version: true } },
        },
        orderBy: { detectedAt: "desc" },
        limit: ALERT_LIMIT,
      }),
      sensitive ? 0 : db.$count(alerts, eq(alerts.isSensitive, true)),
    ]);

    return {
      alerts: collection<Geometry, AlertProps>(
        rows.map(({ location, site, rule, firstObservedAt, detectedAt, ...a }) => ({
          geometry: location,
          properties: {
            ...a,
            firstObservedAt: firstObservedAt.toISOString(),
            detectedAt: detectedAt.toISOString(),
            siteName: site?.name ?? null,
            basin: site?.basin ?? null,
            ruleName: rule ? `${rule.name} (v${rule.version})` : null,
          },
        })),
      ),
      withheld,
    };
  }),
};

type BoundaryProps = {
  id: string;
  kind: (typeof boundaries.$inferSelect)["kind"];
  name: string;
  reference: string | null;
  holder: string | null;
  legalStatus: string | null;
  validFrom: string | null;
  sourceKey: string;
};

type ReachProps = {
  id: string;
  river: string;
  basin: string;
  name: string | null;
  sourceKey: string;
};

type SiteProps = {
  id: string;
  name: string;
  lens: (typeof sites.$inferSelect)["lens"];
  basin: string | null;
  district: string | null;
  isSimulated: boolean;
};

type AlertRow = typeof alerts.$inferSelect;
export type AlertProps = {
  id: string;
  number: number;
  lens: AlertRow["lens"];
  indicator: string;
  title: string;
  summary: string;
  confidence: AlertRow["confidence"];
  status: AlertRow["status"];
  coverage: string;
  limitations: string;
  firstObservedAt: string;
  detectedAt: string;
  isSimulated: boolean;
  siteName: string | null;
  basin: string | null;
  ruleName: string | null;
};
