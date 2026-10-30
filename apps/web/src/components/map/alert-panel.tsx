"use client";

import type { AlertProps } from "@ecolens/api/routers/v1/map";
import { Button, buttonVariants } from "@ecolens/ui/components/button";
import { cn } from "@ecolens/ui/lib/utils";
import { ListChecks, X } from "lucide-react";
import Link from "next/link";

import { ALERT_STATUS, CONFIDENCE, LENS_LABEL } from "./config";
import { ModeBadge } from "./provenance";

const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export const alertRef = (n: number) => `ALT-${String(n).padStart(4, "0")}`;

// Interpret: an alert with its evidence context. The wording never presents
// it as proof of wrongdoing (principle 2).
export function AlertPanel({
  alert,
  onClose,
  className,
}: {
  alert: AlertProps;
  onClose: () => void;
  className?: string;
}) {
  const status = ALERT_STATUS[alert.status];
  const facts: [string, string][] = [
    ["Lens", LENS_LABEL[alert.lens]],
    [
      "Location",
      [alert.siteName, alert.basin && `${alert.basin} basin`].filter(Boolean).join(", ") || "—",
    ],
    ["First observed", when.format(new Date(alert.firstObservedAt))],
    ["Flagged", when.format(new Date(alert.detectedAt))],
    ["Rule", alert.ruleName ?? "—"],
    ["Coverage", alert.coverage],
  ];

  return (
    <aside
      aria-label={`Alert ${alertRef(alert.number)}`}
      className={cn(
        "bg-background/95 text-foreground flex flex-col border backdrop-blur",
        className,
      )}
    >
      <header className="flex items-start gap-2 border-b p-3">
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground font-mono text-[11px]">{alertRef(alert.number)}</p>
          <h2 className="mt-0.5 text-sm font-medium text-pretty">{alert.title}</h2>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 border px-1.5 py-0.5">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: status.color }}
            />
            {status.label}
          </span>
          <span className="border px-1.5 py-0.5">{CONFIDENCE[alert.confidence].label}</span>
          {alert.isSimulated && <ModeBadge mode="simulated" />}
        </div>
        <p className="text-sm text-pretty">{alert.summary}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-pretty">{v}</dd>
            </div>
          ))}
        </dl>
        <div>
          <p className="text-muted-foreground">Known limitations</p>
          <p className="mt-0.5 text-pretty">{alert.limitations}</p>
        </div>
        <Link
          href={`/alerts?alert=${alert.id}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")}
        >
          <ListChecks /> Open in the alert queue
        </Link>
        <p className="text-muted-foreground border-t pt-3 text-[11px] leading-relaxed">
          {alert.status === "new" || alert.status === "in_review"
            ? "An alert is a prompt for review, not proof of wrongdoing. It becomes an incident only after a person validates it."
            : alert.status === "confirmed"
              ? "Confirmed by human review. Confirmation means the change was verified, not that any party has been found responsible."
              : alert.status === "rejected"
                ? "Rejected by human review: the change was not borne out."
                : "Reviewed but unresolved: the evidence was not conclusive either way."}
        </p>
      </div>
    </aside>
  );
}
