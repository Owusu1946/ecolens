"use client";

import { useDataUser } from "@/components/shell/offline-data";
import { type OutboxItem, outbox, useOutbox } from "@/lib/offline/outbox";

import { type ActionKind, type IncidentStatus, incidentRef, type Severity } from "./config";

// Incident actions go through the device outbox like alert decisions
// (principle 7). Until synced, screens show the status a write will set,
// marked as saved on this device; the server stays authoritative.

const TARGET: Record<string, IncidentStatus> = {
  escalate: "open",
  assign: "assigned",
  acknowledge: "in_progress",
  recordAction: "action_recorded",
  close: "closed",
};

const isIncidentWrite = (i: OutboxItem) => i.path[0] === "incidents";

type Ref = { id: string; number: number; version: number };

export function useIncidentWrites() {
  const userId = useDataUser();
  const items = useOutbox(userId).filter(isIncidentWrite);

  const forIncident = (incidentId: string) =>
    items.filter((i) => i.input.incidentId === incidentId || i.id === incidentId);

  /** Waiting writes for an incident, and the status the latest of them sets. */
  function pending(incidentId: string) {
    const queued = forIncident(incidentId).filter((i) => i.status !== "failed");
    const last = queued.at(-1);
    return { queued, status: last ? (TARGET[last.path[1] ?? ""] ?? null) : null };
  }

  /** A queued escalation of an alert, if any. Its outbox id is the incident id. */
  const escalation = (alertId: string) =>
    items.find((i) => i.path[1] === "escalate" && i.input.alertId === alertId) ?? null;

  // Each write waiting to be sent moves the incident on by one version.
  const nextVersion = (incident: Ref) =>
    incident.version + pending(incident.id).queued.filter((i) => i.path[1] !== "escalate").length;

  async function send(path: string, incident: Ref, input: Record<string, unknown>, label: string) {
    if (!userId) return;
    await outbox.enqueue(
      userId,
      ["incidents", path],
      { incidentId: incident.id, expectedVersion: nextVersion(incident), ...input },
      `${label} ${incidentRef(incident.number)}`,
    );
  }

  return {
    forIncident,
    pending,
    escalation,
    async escalate(
      alert: { id: string; ref: string },
      input: {
        title: string;
        severity: Severity;
        responsibleInstitutionId: string;
        reason: string;
      },
    ) {
      if (!userId) return null;
      return outbox.enqueue(
        userId,
        ["incidents", "escalate"],
        { alertId: alert.id, ...input },
        `Escalate ${alert.ref}`,
      );
    },
    assign: (
      incident: Ref,
      input: { institutionId: string; instructions: string; dueAt?: string },
    ) => send("assign", incident, input, "Assign"),
    acknowledge: (incident: Ref) => send("acknowledge", incident, {}, "Acknowledge"),
    recordAction: (
      incident: Ref,
      input: { kind: ActionKind; description: string; takenAt: string },
    ) => send("recordAction", incident, input, "Record action on"),
    close: (incident: Ref, input: { summary: string }) => send("close", incident, input, "Close"),
  };
}
