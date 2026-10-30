import type { Database } from "@ecolens/db";
import {
  alertEvidence,
  alerts,
  auditEvents,
  fieldReportPhotos,
  fieldReports,
  institutions,
  sites,
  verificationRequests,
} from "@ecolens/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq, type SQL, sql } from "drizzle-orm";
import { z } from "zod";

import { hasPermission } from "../../auth/roles";
import { type Actor, authorizedProcedure } from "../../index";
import { institutionNames, mutation } from "./shared";

// Observe (field) and Validate ← field confirmation (use case 4). Authorised
// field officers submit GPS-tagged observations and photos, recorded offline
// and synced later. A report about an alert is attached to it as evidence and
// answers any open verification request for it. Field reports are sensitive
// by default: they place people and activity at exact locations (principle 6).

const ASSESSMENTS = ["supports_alert", "contradicts_alert", "inconclusive"] as const;
const PHOTO_TYPES = ["image/jpeg", "image/webp"] as const;
const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const ACTIVITY_TYPES = [
  "dredging",
  "excavation",
  "heavy_machinery",
  "sediment_plume",
  "river_discolouration",
  "forest_clearing",
  "access_track",
  "camp_or_settlement",
  "farm_burning",
  "none_observed",
  "other",
] as const;

function sensitiveFilter(actor: Actor): SQL | undefined {
  return hasPermission(actor.role, "sensitive_location:read")
    ? undefined
    : eq(fieldReports.isSensitive, false);
}

async function institutionOf(db: Pick<Database, "select">, orgId: string) {
  const [row] = await db
    .select({ id: institutions.id })
    .from(institutions)
    .where(eq(institutions.clerkOrgId, orgId));
  return row?.id ?? null;
}

const photoKey = (reportId: string, photoId: string, type: string) =>
  `field-reports/${reportId}/${photoId}.${type === "image/webp" ? "webp" : "jpg"}`;

const point = (g: unknown) => {
  const [lng, lat] = (g as { coordinates: [number, number] }).coordinates;
  return { lng, lat };
};

export const fieldReportsRouter = {
  // Field reports, newest first. `mine` limits them to the caller's own.
  list: authorizedProcedure("field_report:read")
    .input(
      z.object({
        alertId: z.uuid().optional(),
        mine: z.boolean().default(false),
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(100).default(50),
      }),
    )
    .handler(async ({ input, context: { db, actor } }) => {
      const filters = and(
        sensitiveFilter(actor),
        input.alertId ? eq(fieldReports.alertId, input.alertId) : undefined,
        input.mine ? eq(fieldReports.authorUserId, actor.userId) : undefined,
      );
      const [rows, totals] = await Promise.all([
        db
          .select({
            id: fieldReports.id,
            alertId: fieldReports.alertId,
            alertNumber: alerts.number,
            alertTitle: alerts.title,
            siteName: sites.name,
            basin: sites.basin,
            observation: fieldReports.observation,
            activityTypes: fieldReports.activityTypes,
            assessment: fieldReports.assessment,
            location: fieldReports.location,
            gpsAccuracyM: fieldReports.gpsAccuracyM,
            clientCreatedAt: fieldReports.clientCreatedAt,
            receivedAt: fieldReports.receivedAt,
            authorOrgId: fieldReports.authorOrgId,
            authorUserId: fieldReports.authorUserId,
            isSimulated: fieldReports.isSimulated,
            photoCount: sql<number>`(select count(*)::int from ${fieldReportPhotos} where ${fieldReportPhotos.fieldReportId} = ${fieldReports.id})`,
          })
          .from(fieldReports)
          .leftJoin(alerts, eq(alerts.id, fieldReports.alertId))
          .leftJoin(sites, eq(sites.id, fieldReports.siteId))
          .where(filters)
          .orderBy(desc(fieldReports.clientCreatedAt))
          .limit(input.pageSize + 1)
          .offset(input.page * input.pageSize),
        db.select({ n: count() }).from(fieldReports).where(filters),
      ]);
      const items = rows.slice(0, input.pageSize);
      const names = await institutionNames(
        db,
        items.map((r) => r.authorOrgId),
      );
      return {
        items: items.map(({ authorOrgId, authorUserId, location, ...r }) => ({
          ...r,
          ...point(location),
          clientCreatedAt: r.clientCreatedAt.toISOString(),
          receivedAt: r.receivedAt.toISOString(),
          institution: names.get(authorOrgId) ?? null,
          isMine: authorUserId === actor.userId,
        })),
        hasMore: rows.length > input.pageSize,
        total: totals[0]?.n ?? 0,
      };
    }),

  // One report with its photos.
  get: authorizedProcedure("field_report:read")
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ input, context: { db, actor } }) => {
      const report = await db.query.fieldReports.findFirst({
        where: hasPermission(actor.role, "sensitive_location:read")
          ? { id: input.id }
          : { id: input.id, isSensitive: false },
        with: {
          alert: { columns: { id: true, number: true, title: true, status: true } },
          site: { columns: { name: true, basin: true, district: true } },
          photos: {
            orderBy: { takenAt: "asc" },
            columns: {
              id: true,
              contentType: true,
              width: true,
              height: true,
              takenAt: true,
              uploadedAt: true,
            },
          },
        },
      });
      if (!report) throw new ORPCError("NOT_FOUND", { message: "Field report not found." });
      const names = await institutionNames(db, [report.authorOrgId]);
      const { authorUserId, authorOrgId, location, photos, ...rest } = report;
      return {
        ...rest,
        ...point(location),
        institution: names.get(authorOrgId) ?? null,
        isMine: authorUserId === actor.userId,
        photos: photos.map(({ uploadedAt, ...p }) => ({ ...p, uploaded: !!uploadedAt })),
      };
    }),

  // A photo's bytes. Same visibility as its report.
  photo: authorizedProcedure("field_report:read")
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ input, context: { db, actor, photos } }) => {
      const [row] = await db
        .select({
          reportId: fieldReportPhotos.fieldReportId,
          contentType: fieldReportPhotos.contentType,
          uploadedAt: fieldReportPhotos.uploadedAt,
        })
        .from(fieldReportPhotos)
        .innerJoin(fieldReports, eq(fieldReports.id, fieldReportPhotos.fieldReportId))
        .where(and(eq(fieldReportPhotos.id, input.id), sensitiveFilter(actor)));
      if (!row?.uploadedAt || !photos) {
        throw new ORPCError("NOT_FOUND", { message: "Photo not available." });
      }
      const object = await photos.get(photoKey(row.reportId, input.id, row.contentType));
      if (!object) throw new ORPCError("NOT_FOUND", { message: "Photo not available." });
      return new File([await object.arrayBuffer()], `${input.id}`, { type: row.contentType });
    }),

  // Open verification requests for the caller's institution, oldest due first.
  requests: authorizedProcedure("field_report:create").handler(
    async ({ context: { db, actor } }) => {
      const mine = await institutionOf(db, actor.orgId);
      if (!mine) return [];
      const rows = await db
        .select({
          id: verificationRequests.id,
          instructions: verificationRequests.instructions,
          dueAt: verificationRequests.dueAt,
          requestedAt: verificationRequests.requestedAt,
          requestedByOrgId: verificationRequests.requestedByOrgId,
          alertId: alerts.id,
          alertNumber: alerts.number,
          alertTitle: alerts.title,
          alertStatus: alerts.status,
          lens: alerts.lens,
          // A point on the alert's area, to guide the visit and sort by distance.
          lng: sql<number>`ST_X(ST_PointOnSurface(${alerts.location}))`,
          lat: sql<number>`ST_Y(ST_PointOnSurface(${alerts.location}))`,
          isSensitive: alerts.isSensitive,
          isSimulated: alerts.isSimulated,
          siteName: sites.name,
          basin: sites.basin,
        })
        .from(verificationRequests)
        .innerJoin(alerts, eq(alerts.id, verificationRequests.alertId))
        .leftJoin(sites, eq(sites.id, alerts.siteId))
        .where(
          and(
            eq(verificationRequests.institutionId, mine),
            eq(verificationRequests.status, "open"),
            hasPermission(actor.role, "sensitive_location:read")
              ? undefined
              : eq(alerts.isSensitive, false),
          ),
        )
        .orderBy(
          sql`${verificationRequests.dueAt} asc nulls last`,
          asc(verificationRequests.requestedAt),
        );
      const names = await institutionNames(
        db,
        rows.map((r) => r.requestedByOrgId),
      );
      return rows.map(({ requestedByOrgId, ...r }) => ({
        ...r,
        dueAt: r.dueAt?.toISOString() ?? null,
        requestedAt: r.requestedAt.toISOString(),
        requestedBy: names.get(requestedByOrgId) ?? null,
      }));
    },
  ),

  // Submit a report recorded on the device. The device id becomes the report
  // id; photos are declared here and their bytes sent by `uploadPhoto`.
  create: authorizedProcedure("field_report:create")
    .input(
      z
        .object({
          alertId: z.uuid().optional(),
          location: z.object({
            lng: z.number().min(-180).max(180),
            lat: z.number().min(-90).max(90),
          }),
          gpsAccuracyM: z.number().min(0).max(100_000).optional(),
          observation: z
            .string()
            .trim()
            .min(10, "Describe what you saw in at least 10 characters.")
            .max(4000),
          activityTypes: z.array(z.enum(ACTIVITY_TYPES)).max(ACTIVITY_TYPES.length).default([]),
          assessment: z.enum(ASSESSMENTS).optional(),
          clientCreatedAt: z.iso.datetime({ offset: true }),
          photos: z
            .array(
              z.object({
                id: z.uuid(),
                contentType: z.enum(PHOTO_TYPES),
                bytes: z.number().int().min(1).max(MAX_PHOTO_BYTES),
                width: z.number().int().min(1),
                height: z.number().int().min(1),
                takenAt: z.iso.datetime({ offset: true }).optional(),
              }),
            )
            .max(MAX_PHOTOS)
            .default([]),
          ...mutation,
        })
        .refine((v) => !v.alertId || v.assessment, {
          message: "Say whether what you saw supports the alert.",
          path: ["assessment"],
        }),
    )
    .handler(({ input, context: { db, actor } }) =>
      db.transaction(async (tx) => {
        const id = input.clientMutationId;
        const [existing] = await tx
          .select({ id: fieldReports.id })
          .from(fieldReports)
          .where(eq(fieldReports.id, id));
        if (existing) return { id, replayed: true };

        const createdAt = new Date(input.clientCreatedAt);
        const now = new Date();
        if (createdAt.getTime() > now.getTime() + 10 * 60_000) {
          throw new ORPCError("BAD_REQUEST", { message: "The report's time is in the future." });
        }

        let siteId: string | null = null;
        if (input.alertId) {
          const [alert] = await tx
            .select({ siteId: alerts.siteId, isSensitive: alerts.isSensitive })
            .from(alerts)
            .where(eq(alerts.id, input.alertId));
          if (
            !alert ||
            (alert.isSensitive && !hasPermission(actor.role, "sensitive_location:read"))
          ) {
            throw new ORPCError("NOT_FOUND", { message: "Alert not found." });
          }
          siteId = alert.siteId;
        }

        await tx.insert(fieldReports).values({
          id,
          alertId: input.alertId ?? null,
          siteId,
          authorUserId: actor.userId,
          authorOrgId: actor.orgId,
          location: { type: "Point", coordinates: [input.location.lng, input.location.lat] },
          gpsAccuracyM: input.gpsAccuracyM ?? null,
          observation: input.observation,
          activityTypes: input.activityTypes,
          assessment: input.assessment ?? null,
          clientCreatedAt: createdAt,
          receivedAt: now,
        });
        if (input.photos.length) {
          await tx.insert(fieldReportPhotos).values(
            input.photos.map((p) => ({
              id: p.id,
              fieldReportId: id,
              objectKey: photoKey(id, p.id, p.contentType),
              contentType: p.contentType,
              bytes: p.bytes,
              width: p.width,
              height: p.height,
              takenAt: p.takenAt ? new Date(p.takenAt) : null,
              location: {
                type: "Point" as const,
                coordinates: [input.location.lng, input.location.lat] as [number, number],
              },
            })),
          );
        }

        let fulfilled: string[] = [];
        if (input.alertId) {
          await tx.insert(alertEvidence).values({
            alertId: input.alertId,
            kind: "field_report",
            fieldReportId: id,
            addedByUserId: actor.userId,
            addedAt: now,
          });
          // Answers the open requests to the author's institution for this alert.
          const mine = await institutionOf(tx, actor.orgId);
          if (mine) {
            fulfilled = (
              await tx
                .update(verificationRequests)
                .set({ status: "fulfilled", fulfilledByReportId: id, closedAt: now })
                .where(
                  and(
                    eq(verificationRequests.alertId, input.alertId),
                    eq(verificationRequests.institutionId, mine),
                    eq(verificationRequests.status, "open"),
                  ),
                )
                .returning({ id: verificationRequests.id })
            ).map((r) => r.id);
          }
        }

        await tx.insert(auditEvents).values({
          occurredAt: now,
          actorUserId: actor.userId,
          actorOrgId: actor.orgId,
          actorRole: actor.role,
          action: "field_report.submit",
          entityType: "field_report",
          entityId: id,
          clientMutationId: id,
          data: {
            alertId: input.alertId ?? null,
            assessment: input.assessment ?? null,
            photos: input.photos.length,
            recordedAt: input.clientCreatedAt,
            fulfilledRequests: fulfilled,
          },
        });
        return { id, replayed: false };
      }),
    ),

  // A photo's bytes, sent after its report. Only the author can upload, and
  // only for a photo declared on the report; a repeat upload is a no-op.
  uploadPhoto: authorizedProcedure("field_report:create")
    .input(
      z.object({
        photoId: z.uuid(),
        file: z
          .file()
          .max(MAX_PHOTO_BYTES)
          .mime([...PHOTO_TYPES]),
        clientMutationId: z.uuid(),
      }),
    )
    .handler(async ({ input, context: { db, actor, photos } }) => {
      if (!photos) {
        throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Photo storage is not available." });
      }
      const [photo] = await db
        .select({
          reportId: fieldReportPhotos.fieldReportId,
          contentType: fieldReportPhotos.contentType,
          uploadedAt: fieldReportPhotos.uploadedAt,
          authorUserId: fieldReports.authorUserId,
        })
        .from(fieldReportPhotos)
        .innerJoin(fieldReports, eq(fieldReports.id, fieldReportPhotos.fieldReportId))
        .where(eq(fieldReportPhotos.id, input.photoId));
      if (!photo || photo.authorUserId !== actor.userId) {
        throw new ORPCError("NOT_FOUND", { message: "Photo not found on any of your reports." });
      }
      if (photo.uploadedAt) return { uploaded: true, replayed: true };
      if (input.file.type !== photo.contentType) {
        throw new ORPCError("BAD_REQUEST", {
          message: "The photo's type doesn't match its report.",
        });
      }

      await photos.put(
        photoKey(photo.reportId, input.photoId, photo.contentType),
        // Zod's File type is minimal without the DOM lib; at runtime it is a Blob.
        input.file as unknown as Blob,
        {
          httpMetadata: { contentType: photo.contentType },
        },
      );
      await db
        .update(fieldReportPhotos)
        .set({ uploadedAt: new Date(), bytes: input.file.size })
        .where(eq(fieldReportPhotos.id, input.photoId));
      return { uploaded: true, replayed: false };
    }),
};
