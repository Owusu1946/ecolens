"use client";

import { Button } from "@ecolens/ui/components/button";
import { Input } from "@ecolens/ui/components/input";
import { Label } from "@ecolens/ui/components/label";
import { Textarea } from "@ecolens/ui/components/textarea";
import { cn } from "@ecolens/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";

import { useCanCallApi } from "@/components/shell/use-me";
import { orpc } from "@/utils/orpc";

import { ACTION_KIND, type ActionKind, SEVERITY, type Severity } from "./config";

// Escalate: the forms that move a case along. Each one asks for the reason or
// account that goes into the audit trail (principle 5).

const MIN = 10;
const fieldClass =
  "bg-background h-8 w-full border px-2 text-xs outline-none focus-visible:ring-1 aria-invalid:border-destructive";

function useInstitutions() {
  return useQuery({ ...orpc.incidents.institutions.queryOptions(), enabled: useCanCallApi() });
}

function Form({
  submitLabel,
  missing,
  onSubmit,
  onCancel,
  children,
}: {
  submitLabel: string;
  missing: (string | false)[];
  onSubmit: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const [tried, setTried] = useState(false);
  const gaps = missing.filter(Boolean);
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (gaps.length === 0) onSubmit();
      }}
      className="space-y-4 border p-3 text-xs"
    >
      {children}
      {tried && gaps.length > 0 && (
        <p role="alert" className="text-destructive">
          Add {gaps.join(", ")}.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <div className="mt-1.5">{children(id)}</div>
      {hint && <p className="text-muted-foreground mt-1 text-[11px]">{hint}</p>}
    </div>
  );
}

function Reason({
  label,
  value,
  onChange,
  placeholder,
  hint = "Recorded in the audit trail with your role, institution and the time.",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={4000}
          rows={4}
          placeholder={placeholder}
          className="min-h-24"
        />
      )}
    </Field>
  );
}

function InstitutionSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const institutions = useInstitutions();
  return (
    <Field label="Institution">
      {(id) => (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={fieldClass}
        >
          <option value="" disabled>
            {institutions.data ? "Choose an institution" : "Loading institutions…"}
          </option>
          {institutions.data?.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

const tooShort = (text: string, what: string) =>
  text.trim().length < MIN && `${what} of at least ${MIN} characters`;

export function EscalateForm({
  defaultTitle,
  onSubmit,
  onCancel,
}: {
  defaultTitle: string;
  onSubmit: (v: {
    title: string;
    severity: Severity;
    responsibleInstitutionId: string;
    reason: string;
  }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [lead, setLead] = useState("");
  const [reason, setReason] = useState("");

  return (
    <Form
      submitLabel="Open incident"
      missing={[
        title.trim().length < 5 && "a title",
        !severity && "a severity",
        !lead && "a lead institution",
        tooShort(reason, "a reason"),
      ]}
      onSubmit={() =>
        severity &&
        onSubmit({
          title: title.trim(),
          severity,
          responsibleInstitutionId: lead,
          reason: reason.trim(),
        })
      }
      onCancel={onCancel}
    >
      <Field label="Title">
        {(id) => (
          <Input id={id} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        )}
      </Field>
      <fieldset>
        <legend className="text-xs font-medium">Severity</legend>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          The potential environmental impact, not anyone's culpability.
        </p>
        <div className="mt-2 grid gap-1.5">
          {(Object.keys(SEVERITY) as Severity[]).map((s) => (
            <label
              key={s}
              className={cn(
                "hover:bg-muted/60 flex cursor-pointer items-start gap-2.5 border p-2.5",
                severity === s && "border-foreground/40 bg-muted/60",
              )}
            >
              <input
                type="radio"
                name="severity"
                checked={severity === s}
                onChange={() => setSeverity(s)}
                className="accent-foreground mt-0.5"
              />
              <span>
                <span className="font-medium">{SEVERITY[s].label}</span>
                <span className="text-muted-foreground mt-0.5 block">{SEVERITY[s].hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <p className="text-xs font-medium">Lead institution</p>
        <p className="text-muted-foreground mt-0.5 mb-1.5 text-[11px]">
          Owns the case and its outcome. Others can be assigned to act later.
        </p>
        <InstitutionSelect value={lead} onChange={setLead} />
      </div>
      <Reason
        label="Why escalate"
        value={reason}
        onChange={setReason}
        placeholder="Why does this confirmed change need an institutional response?"
      />
    </Form>
  );
}

export function AssignForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (v: { institutionId: string; instructions: string; dueAt?: string }) => void;
  onCancel: () => void;
}) {
  const [institutionId, setInstitutionId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [due, setDue] = useState("");

  return (
    <Form
      submitLabel="Assign"
      missing={[!institutionId && "an institution", tooShort(instructions, "instructions")]}
      onSubmit={() =>
        onSubmit({
          institutionId,
          instructions: instructions.trim(),
          // End of the chosen day, local time.
          dueAt: due ? new Date(`${due}T23:59:59`).toISOString() : undefined,
        })
      }
      onCancel={onCancel}
    >
      <InstitutionSelect value={institutionId} onChange={setInstitutionId} />
      <Reason
        label="Instructions"
        value={instructions}
        onChange={setInstructions}
        placeholder="What should they do, and what should they report back?"
      />
      <Field label="Due by (optional)">
        {(id) => (
          <Input
            id={id}
            type="date"
            value={due}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDue(e.target.value)}
            className="w-44"
          />
        )}
      </Field>
    </Form>
  );
}

// datetime-local wants local time without a zone.
const localNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export function ActionForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (v: { kind: ActionKind; description: string; takenAt: string }) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<ActionKind | "">("");
  const [description, setDescription] = useState("");
  const [takenAt, setTakenAt] = useState(localNow);

  return (
    <Form
      submitLabel="Record action"
      missing={[
        !kind && "what was done",
        tooShort(description, "a description"),
        !takenAt && "when it was done",
      ]}
      onSubmit={() =>
        kind &&
        onSubmit({
          kind,
          description: description.trim(),
          takenAt: new Date(takenAt).toISOString(),
        })
      }
      onCancel={onCancel}
    >
      <Field
        label="What was done"
        hint={
          kind === "decision_not_to_act"
            ? "A decision not to act is a valid response. Say why in the description."
            : undefined
        }
      >
        {(id) => (
          <select
            id={id}
            value={kind}
            onChange={(e) => setKind(e.target.value as ActionKind)}
            className={fieldClass}
          >
            <option value="" disabled>
              Choose an action
            </option>
            {(Object.keys(ACTION_KIND) as ActionKind[]).map((k) => (
              <option key={k} value={k}>
                {ACTION_KIND[k]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Reason
        label="Description"
        value={description}
        onChange={setDescription}
        placeholder="What was found or done, by whom, and anything still outstanding."
      />
      <Field label="When">
        {(id) => (
          <Input
            id={id}
            type="datetime-local"
            value={takenAt}
            max={localNow()}
            onChange={(e) => setTakenAt(e.target.value)}
            className="w-56"
          />
        )}
      </Field>
    </Form>
  );
}

export function CloseForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (v: { summary: string }) => void;
  onCancel: () => void;
}) {
  const [summary, setSummary] = useState("");
  return (
    <Form
      submitLabel="Close incident"
      missing={[tooShort(summary, "a closing summary")]}
      onSubmit={() => onSubmit({ summary: summary.trim() })}
      onCancel={onCancel}
    >
      <Reason
        label="Closing summary"
        value={summary}
        onChange={setSummary}
        placeholder="The outcome, and anything that should be followed up."
        hint="Shown on the incident and in reports. Recorded in the audit trail."
      />
    </Form>
  );
}
