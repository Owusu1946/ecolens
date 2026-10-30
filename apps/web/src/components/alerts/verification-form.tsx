"use client";

import { Input } from "@ecolens/ui/components/input";
import { useState } from "react";

import { Field, Form, InstitutionSelect, Reason } from "@/components/incidents/incident-forms";

// Validate ← field confirmation: ask an institution's field team to check an
// alert on the ground before it is decided.
export function VerificationForm({
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
      submitLabel="Ask for a field check"
      missing={[
        !institutionId && "the field team's institution",
        instructions.trim().length < 10 && "instructions of at least 10 characters",
      ]}
      onSubmit={() =>
        onSubmit({
          institutionId,
          instructions: instructions.trim(),
          dueAt: due ? new Date(`${due}T23:59:59`).toISOString() : undefined,
        })
      }
      onCancel={onCancel}
    >
      <InstitutionSelect value={institutionId} onChange={setInstitutionId} />
      <Reason
        label="What to check"
        value={instructions}
        onChange={setInstructions}
        placeholder="Where to go, what to look for and what to photograph."
      />
      <Field label="Needed by (optional)">
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
