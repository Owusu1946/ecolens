"use client";

import { Button } from "@ecolens/ui/components/button";
import { Label } from "@ecolens/ui/components/label";
import { Textarea } from "@ecolens/ui/components/textarea";
import { cn } from "@ecolens/ui/lib/utils";
import { useId, useState } from "react";

import { ALERT_STATUS } from "@/components/map/config";

import type { Confidence, Outcome } from "./use-alert-writes";

// Validate: a human decision with a recorded reason (principles 1 and 5). The
// wording keeps "confirmed" to "the change is real", never "someone is at
// fault" (principle 2).

const OUTCOMES: { value: Outcome; label: string; hint: string }[] = [
  {
    value: "confirmed",
    label: "Confirm",
    hint: "The change is real. This is not a finding that anyone is responsible.",
  },
  {
    value: "rejected",
    label: "Reject",
    hint: "The change is not borne out, e.g. cloud, a sensor fault or seasonal variation.",
  },
  {
    value: "unresolved",
    label: "Unresolved",
    hint: "The evidence is not conclusive either way. It can be decided later.",
  },
];

const CONFIDENCES: { value: Confidence; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const MIN_REASON = 10;

export function DecisionForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (decision: { outcome: Outcome; confidence: Confidence; rationale: string }) => void;
  onCancel: () => void;
}) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [rationale, setRationale] = useState("");
  const [tried, setTried] = useState(false);
  const reasonId = useId();

  const reason = rationale.trim();
  const missing = [
    !outcome && "an outcome",
    !confidence && "your confidence",
    reason.length < MIN_REASON && `a reason of at least ${MIN_REASON} characters`,
  ].filter(Boolean);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!outcome || !confidence || reason.length < MIN_REASON) return;
    onSubmit({ outcome, confidence, rationale: reason });
  }

  return (
    <form onSubmit={submit} className="space-y-4 border p-3">
      <fieldset>
        <legend className="text-xs font-medium">Outcome</legend>
        <div className="mt-2 grid gap-1.5">
          {OUTCOMES.map((o) => (
            <label
              key={o.value}
              className={cn(
                "hover:bg-muted/60 flex cursor-pointer items-start gap-2.5 border p-2.5 text-xs",
                outcome === o.value && "border-foreground/40 bg-muted/60",
              )}
            >
              <input
                type="radio"
                name="outcome"
                value={o.value}
                checked={outcome === o.value}
                onChange={() => setOutcome(o.value)}
                className="accent-foreground mt-0.5"
              />
              <span className="min-w-0">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ backgroundColor: ALERT_STATUS[o.value].color }}
                  />
                  {o.label}
                </span>
                <span className="text-muted-foreground mt-0.5 block text-pretty">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xs font-medium">How confident are you?</legend>
        <div className="mt-2 grid grid-cols-3 border">
          {CONFIDENCES.map((c) => (
            <label
              key={c.value}
              className={cn(
                "hover:bg-muted/60 flex cursor-pointer items-center justify-center gap-1.5 border-r py-1.5 text-xs last:border-r-0 has-focus-visible:ring-1",
                confidence === c.value && "bg-muted font-medium",
              )}
            >
              <input
                type="radio"
                name="confidence"
                value={c.value}
                checked={confidence === c.value}
                onChange={() => setConfidence(c.value)}
                className="sr-only"
              />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <Label htmlFor={reasonId} className="text-xs">
          Reason
        </Label>
        <Textarea
          id={reasonId}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          maxLength={4000}
          rows={4}
          aria-invalid={tried && reason.length < MIN_REASON}
          placeholder="What did you check, and what led you to this decision?"
          className="mt-1.5 min-h-24"
        />
        <p className="text-muted-foreground mt-1 text-[11px]">
          Recorded in the audit trail with your role, institution and the time.
        </p>
      </div>

      {tried && missing.length > 0 && (
        <p role="alert" className="text-destructive text-xs">
          Add {missing.join(", ")}.
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Record decision</Button>
      </div>
    </form>
  );
}
