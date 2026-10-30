"use client";

import { ROLE_LABELS, type Role } from "@ecolens/api/auth/roles";
import { Button, buttonVariants } from "@ecolens/ui/components/button";
import { Skeleton } from "@ecolens/ui/components/skeleton";
import { cn } from "@ecolens/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CloudOff, MapPin, RotateCw, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ALERT_STATUS, CONFIDENCE, LENS_LABEL } from "@/components/map/config";
import { ModeBadge } from "@/components/map/provenance";
import { useCanCallApi, useMe } from "@/components/shell/use-me";
import { useOnline } from "@/hooks/use-network";
import { outbox } from "@/lib/offline/outbox";
import { orpc } from "@/utils/orpc";

import { DecisionForm } from "./decision-form";
import {
  type AlertDetail as Alert,
  type AlertStatus,
  alertRef,
  DECIDABLE,
  useAlertWrites,
} from "./use-alert-writes";

// Interpret and Validate: one alert with everything it rests on (evidence,
// sources, rule, limitations), the decisions made on it and the audit trail,
// and the review actions the caller's role allows.

const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const fmt = (iso: string | Date) => when.format(new Date(iso));

const ACTION_LABEL: Record<string, string> = {
  "alert.start_review": "Started review",
  "alert.validate": "Recorded a decision",
  "alert.detect": "Flagged by rule",
};

const ASSESSMENT_LABEL: Record<string, string> = {
  supports_alert: "Supports the alert",
  contradicts_alert: "Contradicts the alert",
  inconclusive: "Inconclusive",
};

const roleLabel = (role: string) => ROLE_LABELS[role as Role] ?? role;
const statusLabel = (s: string | null) => (s ? (ALERT_STATUS[s as AlertStatus]?.label ?? s) : null);

export function AlertDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useQuery({
    ...orpc.alerts.get.queryOptions({ input: { id } }),
    enabled: useCanCallApi(),
  });

  if (query.data) return <Loaded alert={query.data} onClose={onClose} />;

  return (
    <div className="space-y-3 p-4">
      <CloseBar label="Alert" onClose={onClose} />
      {query.isError ? (
        <p className="text-muted-foreground text-sm">
          {query.error.message === "Alert not found."
            ? "This alert isn't available to you, or no longer exists."
            : "This alert hasn't been saved on this device yet. It will load when you're back online."}
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

function CloseBar({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Button variant="ghost" size="sm" onClick={onClose} className="-ml-2 lg:hidden">
        <ArrowLeft /> Queue
      </Button>
      <span className="text-muted-foreground hidden font-mono text-[11px] lg:inline">{label}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Close"
        onClick={onClose}
        className="hidden lg:inline-flex"
      >
        <X />
      </Button>
    </div>
  );
}

function Loaded({ alert, onClose }: { alert: Alert; onClose: () => void }) {
  const me = useMe();
  const online = useOnline();
  const queryClient = useQueryClient();
  const writes = useAlertWrites();
  const [deciding, setDeciding] = useState(false);

  const permissions = me.data?.permissions ?? [];
  const pending = writes.pending(alert.id);
  const failed = writes.forAlert(alert.id).filter((i) => i.status === "failed");
  const status = pending.status ?? alert.status;
  const canTriage = permissions.includes("alert:triage") && status === "new";
  const canDecide = permissions.includes("alert:validate") && DECIDABLE.includes(status);

  const savedNote = online ? "Sending now." : "It will be sent when you're back online.";

  async function startReview() {
    await writes.startReview(alert);
    toast.success(`${alertRef(alert.number)} marked as in review`, { description: savedNote });
  }

  async function decide(decision: Parameters<typeof writes.validate>[1]) {
    await writes.validate(alert, decision);
    setDeciding(false);
    toast.success(`Decision on ${alertRef(alert.number)} saved`, { description: savedNote });
  }

  async function reviewAgain(itemId: string) {
    await outbox.discard(itemId);
    await queryClient.invalidateQueries({ queryKey: orpc.alerts.key() });
  }

  const location = [
    alert.site?.name,
    alert.site?.basin && `${alert.site.basin} basin`,
    alert.site?.district,
  ]
    .filter(Boolean)
    .join(", ");
  const facts: [string, string][] = [
    ["Lens", LENS_LABEL[alert.lens]],
    ["Location", location || "—"],
    ["First observed", fmt(alert.firstObservedAt)],
    ["Flagged", fmt(alert.detectedAt)],
    ["Coverage", alert.coverage],
  ];

  return (
    <article aria-labelledby="alert-title" className="space-y-6 p-4 text-xs sm:p-5">
      <CloseBar label={alertRef(alert.number)} onClose={onClose} />

      <header className="space-y-2">
        <p className="text-muted-foreground font-mono text-[11px] lg:hidden">
          {alertRef(alert.number)}
        </p>
        <h2 id="alert-title" className="text-base font-medium text-pretty">
          {alert.title}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={status} />
          <span className="border px-1.5 py-0.5">{CONFIDENCE[alert.confidence].label}</span>
          {alert.isSimulated && <ModeBadge mode="simulated" />}
          {pending.status && (
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <CloudOff className="size-3" /> Saved on this device
            </span>
          )}
        </div>
        <p className="text-sm text-pretty">{alert.summary}</p>
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

      {(canTriage || canDecide) && !deciding && (
        <div className="flex flex-wrap gap-2">
          {canDecide && <Button onClick={() => setDeciding(true)}>Record a decision</Button>}
          {canTriage && (
            <Button variant="outline" onClick={() => void startReview()}>
              Start review
            </Button>
          )}
        </div>
      )}
      {deciding && (
        <DecisionForm onSubmit={(d) => void decide(d)} onCancel={() => setDeciding(false)} />
      )}

      <p className="text-muted-foreground border-l-2 pl-2.5 leading-relaxed text-pretty">
        {status === "new" || status === "in_review"
          ? "An alert is a prompt for review, not proof of wrongdoing. It becomes an incident only after a person validates it."
          : status === "confirmed"
            ? "Confirmed by human review. Confirmation means the change was verified, not that any party has been found responsible."
            : status === "rejected"
              ? "Rejected by human review: the change was not borne out."
              : "Reviewed but unresolved: the evidence was not conclusive either way."}
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
        <Link
          href={`/map?alert=${alert.id}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}
        >
          <MapPin /> View on map
        </Link>
      </Section>

      <Section title="Known limitations">
        <p className="text-pretty">{alert.limitations}</p>
      </Section>

      {alert.rule && (
        <Section title="Rule that flagged it">
          <p className="font-medium">
            {alert.rule.name}{" "}
            <span className="text-muted-foreground font-normal">v{alert.rule.version}</span>
          </p>
          <p className="text-muted-foreground mt-1 text-pretty">{alert.rule.description}</p>
          {alert.rule.reviewedAt && (
            <p className="text-muted-foreground mt-1">
              Rule last reviewed {fmt(alert.rule.reviewedAt)}
            </p>
          )}
        </Section>
      )}

      <Section title={`Evidence (${alert.evidence.length})`}>
        {alert.evidence.length === 0 ? (
          <p className="text-muted-foreground">No evidence attached yet.</p>
        ) : (
          <ol className="space-y-2">
            {alert.evidence.map((e) => (
              <li key={e.id} className="space-y-1.5 border p-2.5">
                <Evidence item={e} />
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Decisions">
        {alert.validations.length === 0 ? (
          <p className="text-muted-foreground">No decision recorded yet.</p>
        ) : (
          <ol className="space-y-2">
            {alert.validations.map((v) => (
              <li key={v.id} className="space-y-1 border p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={v.outcome} />
                  <span className="border px-1.5 py-0.5">{CONFIDENCE[v.confidence].label}</span>
                </div>
                <p className="text-pretty whitespace-pre-line">{v.rationale}</p>
                <p className="text-muted-foreground">
                  {roleLabel(v.decidedByRole)}
                  {v.institution && `, ${v.institution}`} · {fmt(v.decidedAt)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {alert.incident && (
        <Section title="Incident">
          <p>
            Escalated as{" "}
            <span className="font-mono">INC-{String(alert.incident.number).padStart(4, "0")}</span>{" "}
            ({alert.incident.status.replaceAll("_", " ")}).
          </p>
        </Section>
      )}

      {alert.history && (
        <Section title="Audit trail">
          <ol className="space-y-2 border-l pl-3">
            {alert.history.map((h) => (
              <li key={h.id}>
                <p>
                  <span className="font-medium">{ACTION_LABEL[h.action] ?? h.action}</span>
                  {h.toStatus && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {h.fromStatus ? `${statusLabel(h.fromStatus)} → ` : ""}
                      {statusLabel(h.toStatus)}
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground">
                  {roleLabel(h.actorRole)}
                  {h.institution && `, ${h.institution}`} · {fmt(h.occurredAt)}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function StatusBadge({ status }: { status: AlertStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 border px-1.5 py-0.5">
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ backgroundColor: ALERT_STATUS[status].color }}
      />
      {ALERT_STATUS[status].label}
    </span>
  );
}

function Evidence({ item }: { item: Alert["evidence"][number] }) {
  const o = item.observation;
  const f = item.fieldReport;

  if (o) {
    return (
      <>
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">
            {o.indicator}: {o.value} {o.unit}
          </p>
          <ModeBadge mode={o.source.mode} />
        </div>
        <p className="text-muted-foreground">
          {o.source.name}
          {o.source.steward && ` · ${o.source.steward.name}`} · observed {fmt(o.observedAt)}
          {o.confidence && ` · ${CONFIDENCE[o.confidence].label.toLowerCase()}`}
        </p>
        {item.caption && <p className="text-pretty">{item.caption}</p>}
        {o.qualityNote && <p className="text-pretty">Quality: {o.qualityNote}</p>}
        <p className="text-muted-foreground text-pretty">
          Limitations: {o.source.knownLimitations}
        </p>
      </>
    );
  }

  if (f) {
    return (
      <>
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">
            Field report{f.assessment && ` · ${ASSESSMENT_LABEL[f.assessment] ?? f.assessment}`}
          </p>
          {f.isSimulated && <ModeBadge mode="simulated" />}
        </div>
        <p className="text-muted-foreground">
          {f.authorInstitution ?? "Field team"} · {fmt(f.clientCreatedAt)}
          {f.gpsAccuracyM != null && ` · GPS ±${Math.round(f.gpsAccuracyM)} m`}
        </p>
        <p className="text-pretty whitespace-pre-line">{f.observation}</p>
        {f.activityTypes.length > 0 && (
          <p className="text-muted-foreground">
            Observed: {f.activityTypes.join(", ").replaceAll("_", " ")}
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <p className="font-medium capitalize">{item.kind.replaceAll("_", " ")}</p>
      {item.caption && <p className="text-pretty">{item.caption}</p>}
      <p className="text-muted-foreground">Added {fmt(item.addedAt)}</p>
    </>
  );
}
