"use client";

import type { V1RouterClient } from "@ecolens/api/routers/index";

import { alertRef } from "@/components/map/alert-panel";
import { useDataUser } from "@/components/shell/offline-data";
import { type OutboxItem, outbox, useOutbox } from "@/lib/offline/outbox";

export { alertRef };

export type AlertList = Awaited<ReturnType<V1RouterClient["alerts"]["list"]>>;
export type AlertListItem = AlertList["items"][number];
export type AlertDetail = Awaited<ReturnType<V1RouterClient["alerts"]["get"]>>;
export type AlertStatus = AlertListItem["status"];
export type Outcome = "confirmed" | "rejected" | "unresolved";
export type Confidence = AlertListItem["confidence"];

// Statuses a decision can still be made from (mirrors the API).
export const DECIDABLE: readonly AlertStatus[] = ["new", "in_review", "unresolved"];

const isAlertWrite = (i: OutboxItem) => i.path[0] === "alerts";

// Writes that move an alert's status (a field-check request doesn't).
const isStatusWrite = (i: OutboxItem) => i.path[1] === "validate" || i.path[1] === "startReview";

/** The status a queued write moves its alert to. */
function targetStatus(item: OutboxItem): AlertStatus {
  return item.path[1] === "validate" ? (item.input.outcome as Outcome) : "in_review";
}

/**
 * Review actions on alerts go through the device outbox (principle 7), so they
 * work offline. Until a write is synced, the queue and detail show the status
 * it will set, marked as saved on this device; the server stays authoritative.
 */
export function useAlertWrites() {
  const userId = useDataUser();
  const items = useOutbox(userId).filter(isAlertWrite);

  const forAlert = (alertId: string) => items.filter((i) => i.input.alertId === alertId);

  /** Waiting writes for an alert, and the status the latest of them sets. */
  function pending(alertId: string) {
    const queued = forAlert(alertId).filter((i) => i.status !== "failed" && isStatusWrite(i));
    const last = queued.at(-1);
    return { queued, status: last ? targetStatus(last) : null };
  }

  /**
   * The version the next write should expect: the one last read from the
   * server plus each write still waiting to be sent, because the outbox sends
   * them in order and each one moves the alert on by one version.
   */
  const nextVersion = (alertId: string, serverVersion: number) =>
    serverVersion + pending(alertId).queued.length;

  async function startReview(alert: { id: string; number: number; version: number }) {
    if (!userId) return;
    await outbox.enqueue(
      userId,
      ["alerts", "startReview"],
      { alertId: alert.id, expectedVersion: nextVersion(alert.id, alert.version) },
      `Start review of ${alertRef(alert.number)}`,
    );
  }

  async function validate(
    alert: { id: string; number: number; version: number },
    decision: { outcome: Outcome; confidence: Confidence; rationale: string },
  ) {
    if (!userId) return;
    await outbox.enqueue(
      userId,
      ["alerts", "validate"],
      { alertId: alert.id, expectedVersion: nextVersion(alert.id, alert.version), ...decision },
      `Record decision on ${alertRef(alert.number)}`,
    );
  }

  async function requestVerification(
    alert: { id: string; number: number },
    input: { institutionId: string; instructions: string; dueAt?: string },
  ) {
    if (!userId) return;
    await outbox.enqueue(
      userId,
      ["alerts", "requestVerification"],
      { alertId: alert.id, ...input },
      `Ask for a field check of ${alertRef(alert.number)}`,
    );
  }

  return { forAlert, pending, startReview, validate, requestVerification };
}
