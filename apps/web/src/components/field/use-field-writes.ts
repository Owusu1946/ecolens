"use client";

import { useDataUser } from "@/components/shell/offline-data";
import { type OutboxItem, outbox, useOutbox } from "@/lib/offline/outbox";

import type { Activity, Assessment } from "./config";
import type { PreparedPhoto } from "./photos";

// A field report and its photos are saved on the device together and sent in
// order: the report first, then each photo. Photos wait in IndexedDB as
// blobs until they are uploaded (principle 7, field reporting fully offline).

export type DraftReport = {
  alertId?: string;
  alertRef?: string;
  location: { lng: number; lat: number };
  gpsAccuracyM?: number;
  observation: string;
  activityTypes: Activity[];
  assessment?: Assessment;
};

const isCreate = (i: OutboxItem) => i.path[0] === "fieldReports" && i.path[1] === "create";
const isUpload = (i: OutboxItem) => i.path[0] === "fieldReports" && i.path[1] === "uploadPhoto";

export function useFieldWrites() {
  const userId = useDataUser();
  const items = useOutbox(userId);

  /** Reports saved on this device and not yet accepted by the server. */
  const queued = items.filter(isCreate);
  /** Photos still to upload, per report id. */
  const photosWaiting = (reportId: string) =>
    items.filter((i) => isUpload(i) && i.input.reportId === reportId);

  async function submit(draft: DraftReport, photos: PreparedPhoto[]) {
    if (!userId) return null;
    const { alertRef, ...report } = draft;
    const label = alertRef ? `Field report on ${alertRef}` : "Field report";
    const id = await outbox.enqueue(
      userId,
      ["fieldReports", "create"],
      {
        ...report,
        clientCreatedAt: new Date().toISOString(),
        photos: photos.map((p) => ({
          id: p.id,
          contentType: p.contentType,
          bytes: p.blob.size,
          width: p.width,
          height: p.height,
          takenAt: p.takenAt,
        })),
      },
      label,
    );
    for (const [n, p] of photos.entries()) {
      await outbox.enqueue(
        userId,
        ["fieldReports", "uploadPhoto"],
        // `reportId` is for the device only; the API takes the photo id.
        {
          photoId: p.id,
          file: new File([p.blob], `${p.id}.jpg`, { type: p.contentType }),
          reportId: id,
        },
        `Photo ${n + 1} of ${photos.length} · ${label.toLowerCase()}`,
      );
    }
    return id;
  }

  return { queued, photosWaiting, submit };
}
