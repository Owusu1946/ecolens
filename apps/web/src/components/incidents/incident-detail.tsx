"use client";

import { ROLE_LABELS, type Role } from "@ecolens/api/auth/roles";
import { Button, buttonVariants } from "@ecolens/ui/components/button";
import { Skeleton } from "@ecolens/ui/components/skeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudOff, ListChecks, MapPin, RotateCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/alerts/status-badge";
import { alertRef } from "@/components/alerts/use-alert-writes";
import { CONFIDENCE, LENS_LABEL } from "@/components/map/config";
import { ModeBadge } from "@/components/map/provenance";
import { useCanCallApi, useMe } from "@/components/shell/use-me";
import { CloseBar, Section } from "@/components/shell/workflow";
import { useOnline } from "@/hooks/use-network";
import { formatDate, formatDateTime } from "@/lib/format";
import { outbox } from "@/lib/offline/outbox";
import { orpc } from "@/utils/orpc";

import {
  ACTION_KIND,
  ACTIVE,
  INCIDENT_STATUS,
  type Incident,
  type IncidentStatus,
  incidentRef,
  isOverdue,
  SEVERITY,
} from "./config";
import { ActionForm, AssignForm, CloseForm } from "./incident-forms";
import { useIncidentWrites } from "./use-incident-writes";

// Escalate: one incident, from the confirmed alert it came from to the
// actions taken and the closing summary, with the actions the caller's role
// and institution allow.

const ACTION_LABEL: Record<string, string> = {
  "incident.open": "Opened the incident",
  "incident.assign": "Assigned",
  "incident.acknowledge": "Acknowledged",
  "incident.record_action": "Recorded an action",
  "incident.close": "Closed",
};

const roleLabel = (role: string) => ROLE_LABELS[role as Role] ?? role;
const statusLabel = (s: string | null) =>
  s ? (INCIDENT_STATUS[s as IncidentStatus]?.label ?? s) : null;

function hoursBetween(from: string | Date, to: string | Date) {
  const hours = (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000;
  return hours < 48 ? `${Math.max(0, Math.round(hours))} h` : `${Math.round(hours / 24)} days`;
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 border px-1.5 py-0.5">
      <span
        aria-hidden
        className="size-2 rotate-45"
        style={{ backgroundColor: INCIDENT_STATUS[status].color }}
      />
      {INCIDENT_STATUS[status].label}
    </span>
  );
}

export function IncidentDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useQuery({
    ...orpc.incidents.get.queryOptions({ input: { id } }),
    enabled: useCanCallApi(),
  });
  const writes = useIncidentWrites();

  if (query.data) return <Loaded incident={query.data} onClose={onClose} />;

  // Escalated on this device and not synced yet.
  const queued = writes.forIncident(id).find((i) => i.path[1] === "escalate");

  return (
    <div className="space-y-3 p-4 text-xs">
      <CloseBar label="Incident" back="Incidents" onClose={onClose} />
      {queued ? (
        <div className="space-y-2">
          <h2 className="text-base font-medium">{String(queued.input.title)}</h2>
          <p className="text-muted-foreground inline-flex items-center gap-1">
            <CloudOff className="size-3" />
            {queued.status === "failed"
              ? `Not opened: ${queued.error}`
              : "Saved on this device. The incident opens when this syncs."}
          </p>
        </div>
      ) : query.isError ? (
        <p className="text-muted-foreground text-sm">
          {query.error.message === "Incident not found."
            ? "This incident isn't available to you, or no longer exists."
            : "This incident hasn't been saved on this device yet. It will load when you're back online."}
        </p>
      ) : (
        <>
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
        </>
      )}
    </div>
  );
}

type Panel = "assign" | "action" | "close" | null;

function Loaded({ incident, onClose }: { incident: Incident; onClose: () => void }) {
  const me = useMe();
  const online = useOnline();
  const queryClient = useQueryClient();
  const writes = useIncidentWrites();
  const [panel, setPanel] = useState<Panel>(null);

  const permissions = me.data?.permissions ?? [];
  const pending = writes.pending(incident.id);
  const failed = writes.forIncident(incident.id).filter((i) => i.status === "failed");
  const status = pending.status ?? incident.status;
  const act = permissions.includes("incident:act") && incident.involved;
  const can = {
    assign: permissions.includes("incident:assign") && ACTIVE.includes(status),
    acknowledge: act && status === "assigned",
    action: act && ["assigned", "in_progress", "action_recorded"].includes(status),
    close: permissions.includes("incident:close") && status === "action_recorded",
  };

  const ref = incidentRef(incident.number);
  const savedNote = online ? "Sending now." : "It will be sent when you're back online.";
  async function run(write: Promise<unknown>, message: string) {
    await write;
    setPanel(null);
    toast.success(`${message} ${ref}`, { description: savedNote });
  }
  async function reviewAgain(itemId: string) {
    await outbox.discard(itemId);
    await queryClient.invalidateQueries({ queryKey: orpc.incidents.key() });
  }

  const alert = incident.alert;
  const latestDue = incident.assignments.at(-1)?.dueAt ?? null;
  const overdue = isOverdue({ status, dueAt: latestDue });
  const firstAction = incident.actions[0];
  const place = [
    alert.site?.name,
    alert.site?.basin && `${alert.site.basin} basin`,
    alert.site?.district,
  ]
    .filter(Boolean)
    .join(", ");

  const facts: [string, string][] = [
    ["Lead institution", incident.responsibleInstitution?.name ?? "—"],
    [
      "Opened",
      `${formatDateTime(incident.openedAt)}${incident.openedBy ? ` by ${incident.openedBy}` : ""}`,
    ],
    ["Location", place || "—"],
    ...(latestDue ? [["Due", formatDate(latestDue)] as [string, string]] : []),
    // MEL: response speed, from human validation to the first documented action.
    ...(alert.validatedAt && firstAction
      ? [
          ["Validation to first action", hoursBetween(alert.validatedAt, firstAction.takenAt)] as [
            string,
            string,
          ],
        ]
      : []),
    ...(incident.closedAt
      ? [["Closed", formatDateTime(incident.closedAt)] as [string, string]]
      : []),
  ];

  return (
    <article aria-labelledby="incident-title" className="space-y-6 p-4 text-xs sm:p-5">
      <CloseBar label={ref} back="Incidents" onClose={onClose} />

      <header className="space-y-2">
        <p className="text-muted-foreground font-mono text-[11px] lg:hidden">{ref}</p>
        <h2 id="incident-title" className="text-base font-medium text-pretty">
          {incident.title}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <IncidentStatusBadge status={status} />
          <span className="border px-1.5 py-0.5">{SEVERITY[incident.severity].label}</span>
          {overdue && (
            <span className="border border-amber-500/50 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
              Overdue
            </span>
          )}
          {alert.isSimulated && <ModeBadge mode="simulated" />}
          {pending.status && (
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <CloudOff className="size-3" /> Saved on this device
            </span>
          )}
        </div>
      </header>

      {failed.map((item) => (
        <div key={item.id} role="alert" className="border-destructive/40 space-y-2 border p-3">
          <p className="text-destructive font-medium">{item.label}: not saved</p>
          <p className="text-pretty">{item.error}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void reviewAgain(item.id)}>
              <RotateCw /> Review the latest version
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void outbox.discard(item.id)}>
              <Trash2 /> Discard
            </Button>
          </div>
        </div>
      ))}

      {panel === null && (can.assign || can.acknowledge || can.action || can.close) && (
        <div className="flex flex-wrap gap-2">
          {can.action && <Button onClick={() => setPanel("action")}>Record an action</Button>}
          {can.close && <Button onClick={() => setPanel("close")}>Close incident</Button>}
          {can.acknowledge && (
            <Button
              variant="outline"
              onClick={() => void run(writes.acknowledge(incident), "Acknowledged")}
            >
              Acknowledge
            </Button>
          )}
          {can.assign && (
            <Button variant="outline" onClick={() => setPanel("assign")}>
              {incident.assignments.length ? "Assign another institution" : "Assign"}
            </Button>
          )}
        </div>
      )}
      {panel === "assign" && (
        <AssignForm
          onSubmit={(v) => void run(writes.assign(incident, v), "Assignment saved on")}
          onCancel={() => setPanel(null)}
        />
      )}
      {panel === "action" && (
        <ActionForm
          onSubmit={(v) => void run(writes.recordAction(incident, v), "Action saved on")}
          onCancel={() => setPanel(null)}
        />
      )}
      {panel === "close" && (
        <CloseForm
          onSubmit={(v) => void run(writes.close(incident, v), "Closing saved for")}
          onCancel={() => setPanel(null)}
        />
      )}

      <p className="text-muted-foreground border-l-2 pl-2.5 leading-relaxed text-pretty">
        An incident records the institutional response to a change confirmed by human review. It is
        not a finding of wrongdoing against any party.
      </p>

      <Section title="Details">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-pretty">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {incident.closureSummary && (
        <Section title="Closing summary">
          <p className="text-pretty whitespace-pre-line">{incident.closureSummary}</p>
        </Section>
      )}

      <Section title="From alert">
        <div className="space-y-1.5 border p-2.5">
          <p className="text-muted-foreground font-mono text-[11px]">{alertRef(alert.number)}</p>
          <p className="font-medium text-pretty">{alert.title}</p>
          <div className="text-muted-foreground flex flex-wrap items-center gap-1.5">
            <StatusBadge status={alert.status} />
            <span>{CONFIDENCE[alert.confidence].label}</span>
            <span aria-hidden>·</span>
            <span>{LENS_LABEL[alert.lens]}</span>
          </div>
          <p className="text-pretty">{alert.summary}</p>
          <p className="text-muted-foreground text-pretty">Limitations: {alert.limitations}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {permissions.includes("alert:read") && (
              <>
                <Link
                  href={`/alerts?view=all&alert=${alert.id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <ListChecks /> Evidence and decisions
                </Link>
                <Link
                  href={`/map?alert=${alert.id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <MapPin /> View on map
                </Link>
              </>
            )}
          </div>
        </div>
      </Section>

      <Section title={`Assignments (${incident.assignments.length})`}>
        {incident.assignments.length === 0 ? (
          <p className="text-muted-foreground">No institution has been asked to act yet.</p>
        ) : (
          <ol className="space-y-2">
            {incident.assignments.map((a) => (
              <li key={a.id} className="space-y-1 border p-2.5">
                <p className="font-medium">{a.institution.name}</p>
                {a.instructions && (
                  <p className="text-pretty whitespace-pre-line">{a.instructions}</p>
                )}
                <p className="text-muted-foreground">
                  {formatDateTime(a.assignedAt)}
                  {a.assignedBy && ` by ${a.assignedBy}`}
                  {a.dueAt && ` · due ${formatDate(a.dueAt)}`}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title={`Actions taken (${incident.actions.length})`}>
        {incident.actions.length === 0 ? (
          <p className="text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ol className="space-y-2">
            {incident.actions.map((a) => (
              <li key={a.id} className="space-y-1 border p-2.5">
                <p className="font-medium">{ACTION_KIND[a.kind]}</p>
                <p className="text-pretty whitespace-pre-line">{a.description}</p>
                <p className="text-muted-foreground">
                  {formatDateTime(a.takenAt)}
                  {a.recordedBy && ` · ${a.recordedBy}`}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {incident.history && (
        <Section title="Audit trail">
          <ol className="space-y-2 border-l pl-3">
            {incident.history.map((h) => (
              <li key={h.id}>
                <p>
                  <span className="font-medium">{ACTION_LABEL[h.action] ?? h.action}</span>
                  {h.toStatus && h.toStatus !== h.fromStatus && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {h.fromStatus ? `${statusLabel(h.fromStatus)} → ` : ""}
                      {statusLabel(h.toStatus)}
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground">
                  {roleLabel(h.actorRole)}
                  {h.institution && `, ${h.institution}`} · {formatDateTime(h.occurredAt)}
                </p>
                {h.reason && <p className="mt-0.5 text-pretty whitespace-pre-line">{h.reason}</p>}
              </li>
            ))}
          </ol>
        </Section>
      )}
    </article>
  );
}
