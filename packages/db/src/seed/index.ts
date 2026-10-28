// Seeds the prototype: Clerk institutions and demo users, then the database.
//
//   pnpm db:seed           seed an empty database
//   pnpm db:seed --reset   wipe all Ecolens tables first (development only)
//
// Reads DATABASE_URL and CLERK_SECRET_KEY from apps/server/.env via varlock.

import "varlock/auto-load";

import { sql } from "drizzle-orm";

import type { Geometry, Point } from "../geo";
import { createDb } from "../index";
import * as s from "../schema";
import { type ClerkIds, seedClerk } from "./clerk";
import {
  BASINS,
  CONCESSIONS,
  INSTITUTIONS,
  type InstitutionKey,
  PEOPLE,
  type PersonKey,
  pt,
  REACHES,
  RESERVES,
  RULES,
  SITES,
  type SiteKey,
  SOURCES,
  type SourceKey,
} from "./reference";
import { SCENARIOS, type Scenario } from "./scenarios";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();
const at = (daysAgo: number, plusHours = 0) => {
  const t = now - daysAgo * DAY + plusHours * HOUR;
  if (t > now) throw new Error(`Seed timeline runs into the future (${daysAgo}d + ${plusHours}h)`);
  return new Date(t);
};

// Deterministic randomness so every seed produces the same data.
let state = 0x5eed;
const rand = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// The single row an INSERT ... RETURNING produced.
const one = <T>(rows: T[]): T => {
  const row = rows[0];
  if (!row) throw new Error("Insert returned no row");
  return row;
};
const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;
const jitter = (p: Point, metres: number): Point => {
  const d = metres / 111_000;
  const [lon, lat] = p.coordinates;
  return pt(round(lon + (rand() - 0.5) * 2 * d, 5), round(lat + (rand() - 0.5) * 2 * d, 5));
};

const INDICATOR_SOURCE: Record<string, { source: SourceKey; unit: string }> = {
  turbidity_ntu: { source: "s2Turbidity", unit: "NTU (est.)" },
  disturbance_area_ha: { source: "radd", unit: "ha" },
  frp_mw: { source: "firms", unit: "MW" },
  pm25_ugm3: { source: "openaq", unit: "µg/m³" },
};

async function main() {
  const reset = process.argv.includes("--reset");
  const { DATABASE_URL, CLERK_SECRET_KEY, NODE_ENV } = process.env;
  if (!DATABASE_URL || !CLERK_SECRET_KEY) {
    throw new Error("DATABASE_URL and CLERK_SECRET_KEY must be set (apps/server/.env)");
  }
  if (NODE_ENV === "production") {
    throw new Error("Refusing to seed in production.");
  }

  console.log("Clerk: institutions and demo users");
  const clerk = await seedClerk(CLERK_SECRET_KEY);

  const db = createDb(DATABASE_URL);
  try {
    const [{ count }] = (
      await db.execute<{ count: number }>(sql`select count(*)::int as count from institutions`)
    ).rows as [{ count: number }];
    if (count > 0 && !reset) {
      throw new Error("Database already has data. Re-run with --reset to wipe and reseed.");
    }
    if (reset) {
      console.log("Database: wiping Ecolens tables");
      await wipe(db);
    }
    console.log("Database: seeding");
    await seedDatabase(db, clerk);
  } finally {
    await db.$client.end();
  }
}

type Db = ReturnType<typeof createDb>;

// Development only. audit_events is append-only, so its guard triggers are
// lifted for the duration of the wipe and restored in the same transaction.
async function wipe(db: Db) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`alter table audit_events disable trigger audit_events_append_only`);
    await tx.execute(sql`alter table audit_events disable trigger audit_events_no_truncate`);
    await tx.execute(sql`
      truncate audit_events, reports, incident_actions, incident_assignments, incidents,
        validations, alert_evidence, field_report_photos, field_reports, alerts, observations,
        anomaly_rules, river_reaches, boundaries, sites, data_sources, institutions
      restart identity cascade`);
    await tx.execute(sql`alter table audit_events enable trigger audit_events_append_only`);
    await tx.execute(sql`alter table audit_events enable trigger audit_events_no_truncate`);
  });
}

async function seedDatabase(db: Db, clerk: ClerkIds) {
  const actor = (p: PersonKey) => ({
    userId: clerk.users[p],
    orgId: clerk.orgs[PEOPLE[p].institution],
    role: PEOPLE[p].role,
  });
  const SYSTEM = { userId: "system:analysis", orgId: clerk.orgs.platform, role: "system" };

  await db.transaction(async (tx) => {
    // Institutions
    const institutionIds = {} as Record<InstitutionKey, string>;
    for (const [key, inst] of Object.entries(INSTITUTIONS) as [
      InstitutionKey,
      (typeof INSTITUTIONS)[InstitutionKey],
    ][]) {
      const row = one(
        await tx
          .insert(s.institutions)
          .values({ ...inst, clerkOrgId: clerk.orgs[key] })
          .returning({ id: s.institutions.id }),
      );
      institutionIds[key] = row.id;
    }

    // Data sources
    const sourceIds = {} as Record<SourceKey, string>;
    for (const [key, src] of Object.entries(SOURCES) as [
      SourceKey,
      (typeof SOURCES)[SourceKey],
    ][]) {
      const { steward, ...rest } = src;
      const row = one(
        await tx
          .insert(s.dataSources)
          .values({ ...rest, stewardInstitutionId: steward ? institutionIds[steward] : null })
          .returning({ id: s.dataSources.id }),
      );
      sourceIds[key] = row.id;
    }

    // Sites
    const siteIds = {} as Record<SiteKey, string>;
    for (const [key, site] of Object.entries(SITES) as [SiteKey, (typeof SITES)[SiteKey]][]) {
      const { baseline: _baseline, ...rest } = site;
      const row = one(
        await tx
          .insert(s.sites)
          .values({ ...rest, isSimulated: true })
          .returning({ id: s.sites.id }),
      );
      siteIds[key] = row.id;
    }

    // Boundaries and rivers
    await tx.insert(s.boundaries).values([
      ...BASINS.map((b) => ({
        kind: "basin" as const,
        name: b.name,
        area: b.area,
        sourceId: sourceIds.hydrography,
      })),
      ...RESERVES.map((r) => ({
        kind: "forest_reserve" as const,
        name: r.name,
        legalStatus: "Gazetted forest reserve (outline illustrative)",
        area: r.area,
        sourceId: sourceIds.reserves,
      })),
      ...CONCESSIONS.map((c) => ({
        kind: "mining_concession" as const,
        ...c,
        sourceId: sourceIds.concessions,
      })),
    ]);
    await tx
      .insert(s.riverReaches)
      .values(REACHES.map((r) => ({ ...r, sourceId: sourceIds.hydrography })));

    // Anomaly rules, reviewed by the EPA analyst before the pilot period
    const ruleIds: Record<string, string> = {};
    for (const rule of RULES) {
      const row = one(
        await tx
          .insert(s.anomalyRules)
          .values({ ...rule, reviewedByUserId: clerk.users.epaAnalyst, reviewedAt: at(110) })
          .returning({ id: s.anomalyRules.id }),
      );
      ruleIds[rule.key] = row.id;
    }

    // Background observations: 120 days of routine readings
    const background: (typeof s.observations.$inferInsert)[] = [];
    for (const [key, site] of Object.entries(SITES) as [SiteKey, (typeof SITES)[SiteKey]][]) {
      if (site.lens === "water" && site.baseline) {
        for (let d = 120; d >= 1; d -= 5) {
          if (rand() < 0.3) continue; // cloud cover: no reading
          background.push({
            sourceId: sourceIds.s2Turbidity,
            siteId: siteIds[key],
            lens: "water",
            indicator: "turbidity_ntu",
            value: round(site.baseline * (0.75 + rand() * 0.5)),
            unit: "NTU (est.)",
            observedAt: at(d, 10.5),
            location: site.location,
            confidence: "medium",
            externalId: `${key}-s2-${d}`,
            isSimulated: true,
          });
        }
        for (const d of [105, 75, 45, 15]) {
          background.push({
            sourceId: sourceIds.epaSampling,
            siteId: siteIds[key],
            lens: "water",
            indicator: "turbidity_ntu",
            value: round(site.baseline * (0.8 + rand() * 0.4)),
            unit: "NTU",
            observedAt: at(d, 9),
            location: jitter(site.location, 150),
            confidence: "high",
            externalId: `${key}-epa-${d}`,
            isSimulated: true,
          });
        }
      }
      if (site.lens === "air" && site.baseline) {
        for (let d = 120; d >= 1; d--) {
          if (rand() < 0.08) continue; // sensor offline
          background.push({
            sourceId: sourceIds.openaq,
            siteId: siteIds[key],
            lens: "air",
            indicator: "pm25_ugm3",
            value: round(site.baseline * (0.65 + rand() * 0.7)),
            unit: "µg/m³",
            observedAt: at(d),
            location: site.location,
            confidence: "low",
            qualityNote: "Low-cost sensor; not reference-grade",
            externalId: `${key}-pm25-${d}`,
            isSimulated: true,
          });
        }
      }
    }
    for (let i = 0; i < background.length; i += 500) {
      await tx.insert(s.observations).values(background.slice(i, i + 500));
    }

    // Alert storylines, in detection order so alert numbers read chronologically
    const audit: (typeof s.auditEvents.$inferInsert)[] = [];
    const ordered = [...SCENARIOS].sort((a, b) => b.detectedDaysAgo - a.detectedDaysAgo);
    for (const sc of ordered) {
      await seedScenario(sc);
    }

    audit.sort((a, b) => (a.occurredAt?.getTime() ?? 0) - (b.occurredAt?.getTime() ?? 0));
    for (let i = 0; i < audit.length; i += 500) {
      await tx.insert(s.auditEvents).values(audit.slice(i, i + 500));
    }

    console.log(
      `  ${Object.keys(institutionIds).length} institutions, ${Object.keys(sourceIds).length} sources, ` +
        `${Object.keys(siteIds).length} sites, ${background.length} background observations, ` +
        `${SCENARIOS.length} alerts, ${audit.length} audit events`,
    );

    async function seedScenario(sc: Scenario) {
      const site = SITES[sc.site];
      const detectedAt = at(sc.detectedDaysAgo);
      const firstObservedAt = new Date(detectedAt.getTime() - sc.latencyHours * HOUR);
      const after = (h: number) => at(sc.detectedDaysAgo, h);
      const location: Geometry = sc.area ?? site.location;
      const src = INDICATOR_SOURCE[sc.indicator];
      if (!src) throw new Error(`No source mapped for indicator ${sc.indicator}`);

      // Observe: the readings that triggered the rule
      const triggering = await tx
        .insert(s.observations)
        .values(
          [0.8, 1].map((f, i) => ({
            sourceId: sourceIds[src.source],
            siteId: siteIds[sc.site],
            lens: sc.lens,
            indicator: sc.indicator,
            value: round(sc.peak * f),
            unit: src.unit,
            observedAt:
              i === 0
                ? firstObservedAt
                : new Date(firstObservedAt.getTime() + (sc.latencyHours * HOUR) / 2),
            location: sc.area ?? (i === 0 ? site.location : jitter(site.location, 300)),
            confidence: sc.confidence,
            externalId: `${sc.key}-trigger-${i}`,
            isSimulated: true,
          })),
        )
        .returning({ id: s.observations.id });

      // Final status after the storyline plays out
      const status = sc.validation?.outcome ?? (sc.review ? "in_review" : "new");
      const transitions = 1 + (sc.review ? 1 : 0) + (sc.validation ? 1 : 0); // detect, review, validate
      const lastAlertChange = sc.validation
        ? after(sc.validation.afterHours)
        : sc.review
          ? after(sc.review.afterHours)
          : detectedAt;

      const alert = one(
        await tx
          .insert(s.alerts)
          .values({
            lens: sc.lens,
            indicator: sc.indicator,
            title: sc.title,
            summary: sc.summary,
            ruleId: ruleIds[sc.rule],
            siteId: siteIds[sc.site],
            location,
            confidence: sc.confidence,
            status,
            coverage: sc.coverage,
            limitations: sc.limitations,
            firstObservedAt,
            detectedAt,
            validatedAt: sc.validation ? after(sc.validation.afterHours) : null,
            isSensitive: sc.isSensitive ?? site.isSensitive ?? false,
            isSimulated: true,
            version: transitions,
            updatedAt: lastAlertChange,
          })
          .returning({ id: s.alerts.id }),
      );
      const alertId = alert.id;

      let alertVersion = 1;
      audit.push({
        occurredAt: detectedAt,
        actorUserId: SYSTEM.userId,
        actorOrgId: SYSTEM.orgId,
        actorRole: SYSTEM.role,
        action: "alert.detect",
        entityType: "alert",
        entityId: alertId,
        toStatus: "new",
        reason: `Rule ${sc.rule} triggered`,
        entityVersion: alertVersion,
      });

      await tx.insert(s.alertEvidence).values([
        ...triggering.map((o) => ({ alertId, kind: "observation" as const, observationId: o.id })),
        ...(sc.lens === "water" || sc.lens === "forest_land"
          ? [
              {
                alertId,
                kind: "imagery" as const,
                caption: `${sc.lens === "water" ? "Sentinel-2 true colour" : "Sentinel-2 before/after"}, ${detectedAt.toISOString().slice(0, 10)}`,
              },
            ]
          : []),
      ]);

      // Interpret → review starts
      if (sc.review) {
        const a = actor(sc.review.by);
        audit.push({
          occurredAt: after(sc.review.afterHours),
          actorUserId: a.userId,
          actorOrgId: a.orgId,
          actorRole: a.role,
          action: "alert.start_review",
          entityType: "alert",
          entityId: alertId,
          fromStatus: "new",
          toStatus: "in_review",
          entityVersion: ++alertVersion,
        });
      }

      // Validate ← field confirmation
      if (sc.fieldReport) {
        const fr = sc.fieldReport;
        const a = actor(fr.by);
        const recordedAt = after(fr.afterHours);
        const report = one(
          await tx
            .insert(s.fieldReports)
            .values({
              alertId,
              siteId: siteIds[sc.site],
              authorUserId: a.userId,
              authorOrgId: a.orgId,
              location: jitter(site.location, 400),
              gpsAccuracyM: round(4 + rand() * 12),
              observation: fr.observation,
              activityTypes: fr.activityTypes,
              assessment: fr.assessment,
              clientCreatedAt: recordedAt,
              // Submitted from the field, synced when the device got signal.
              receivedAt: new Date(Math.min(now, recordedAt.getTime() + (0.5 + rand() * 5) * HOUR)),
              isSimulated: true,
            })
            .returning({ id: s.fieldReports.id }),
        );
        await tx.insert(s.alertEvidence).values({
          alertId,
          kind: "field_report",
          fieldReportId: report.id,
          addedByUserId: a.userId,
        });
        audit.push({
          occurredAt: recordedAt,
          actorUserId: a.userId,
          actorOrgId: a.orgId,
          actorRole: a.role,
          action: "field_report.submit",
          entityType: "field_report",
          entityId: report.id,
          data: { alertId, assessment: fr.assessment },
        });
      }

      if (sc.validation) {
        const v = sc.validation;
        const a = actor(v.by);
        await tx.insert(s.validations).values({
          alertId,
          outcome: v.outcome,
          rationale: v.rationale,
          confidence: v.confidence,
          decidedByUserId: a.userId,
          decidedByOrgId: a.orgId,
          decidedByRole: a.role,
          decidedAt: after(v.afterHours),
        });
        audit.push({
          occurredAt: after(v.afterHours),
          actorUserId: a.userId,
          actorOrgId: a.orgId,
          actorRole: a.role,
          action: "alert.validate",
          entityType: "alert",
          entityId: alertId,
          fromStatus: sc.review ? "in_review" : "new",
          toStatus: v.outcome,
          reason: v.rationale,
          entityVersion: ++alertVersion,
        });
      }

      // Escalate → incident, assignments, actions, closure
      if (sc.incident) {
        const inc = sc.incident;
        const opener = actor(inc.by);
        const status = inc.close
          ? "closed"
          : inc.actions.length
            ? "action_recorded"
            : inc.assignments.length
              ? "assigned"
              : "open";
        const changes = 1 + inc.assignments.length + inc.actions.length + (inc.close ? 1 : 0);
        const lastChange = Math.max(
          inc.afterHours,
          ...inc.assignments.map((x) => x.afterHours),
          ...inc.actions.map((x) => x.afterHours),
          inc.close?.afterHours ?? 0,
        );
        const incident = one(
          await tx
            .insert(s.incidents)
            .values({
              alertId,
              title: inc.title,
              severity: inc.severity,
              status,
              responsibleInstitutionId: institutionIds[inc.responsible],
              openedByUserId: opener.userId,
              openedByOrgId: opener.orgId,
              openedAt: after(inc.afterHours),
              closedAt: inc.close ? after(inc.close.afterHours) : null,
              closureSummary: inc.close?.summary ?? null,
              isSensitive: sc.isSensitive ?? false,
              version: changes,
              updatedAt: after(lastChange),
            })
            .returning({ id: s.incidents.id }),
        );
        const incidentId = incident.id;

        type Step = { t: number; event: typeof s.auditEvents.$inferInsert };
        const steps: Step[] = [
          {
            t: inc.afterHours,
            event: {
              actorUserId: opener.userId,
              actorOrgId: opener.orgId,
              actorRole: opener.role,
              action: "incident.open",
              entityType: "incident",
              entityId: incidentId,
              toStatus: "open",
              reason: inc.title,
              data: { alertId, responsible: INSTITUTIONS[inc.responsible].shortName },
            },
          },
        ];

        for (const asg of inc.assignments) {
          const a = actor(asg.by);
          await tx.insert(s.incidentAssignments).values({
            incidentId,
            institutionId: institutionIds[asg.to],
            instructions: asg.instructions,
            dueAt: new Date(after(asg.afterHours).getTime() + asg.dueInDays * DAY),
            assignedByUserId: a.userId,
            assignedByOrgId: a.orgId,
            assignedAt: after(asg.afterHours),
          });
          steps.push({
            t: asg.afterHours,
            event: {
              actorUserId: a.userId,
              actorOrgId: a.orgId,
              actorRole: a.role,
              action: "incident.assign",
              entityType: "incident",
              entityId: incidentId,
              toStatus: "assigned",
              reason: asg.instructions,
              data: { institution: INSTITUTIONS[asg.to].shortName },
            },
          });
        }

        for (const act of inc.actions) {
          const a = actor(act.by);
          await tx.insert(s.incidentActions).values({
            incidentId,
            kind: act.kind,
            description: act.description,
            takenAt: after(act.afterHours),
            recordedByUserId: a.userId,
            recordedByOrgId: a.orgId,
            recordedAt: after(act.afterHours + 0.5 + rand() * 3),
          });
          steps.push({
            t: act.afterHours + 0.5,
            event: {
              actorUserId: a.userId,
              actorOrgId: a.orgId,
              actorRole: a.role,
              action: "incident.record_action",
              entityType: "incident",
              entityId: incidentId,
              toStatus: "action_recorded",
              reason: act.description,
              data: { kind: act.kind },
            },
          });
        }

        if (inc.close) {
          const a = actor(inc.close.by);
          steps.push({
            t: inc.close.afterHours,
            event: {
              actorUserId: a.userId,
              actorOrgId: a.orgId,
              actorRole: a.role,
              action: "incident.close",
              entityType: "incident",
              entityId: incidentId,
              toStatus: "closed",
              reason: inc.close.summary,
            },
          });
        }

        // Chain the statuses and versions in time order.
        steps.sort((x, y) => x.t - y.t);
        let previous: string | null = null;
        steps.forEach((step, i) => {
          audit.push({
            ...step.event,
            occurredAt: after(step.t),
            fromStatus: previous,
            entityVersion: i + 1,
          });
          previous = step.event.toStatus ?? previous;
        });
      }
    }
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
