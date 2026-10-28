import type { Metadata } from "next";

import { PlannedSection } from "@/components/shell/page";

export const metadata: Metadata = { title: "Incidents · Ecolens" };

export default function IncidentsPage() {
  return (
    <PlannedSection
      title="Incidents"
      stage={"Escalate"}
      permission="incident:read"
      description="Validated alerts routed to a responsible institution, with the response tracked."
      plan={[
        "Assign a responsible institution and a due date",
        "Record action taken, or a documented decision not to act",
        "Full audit trail of every status change",
      ]}
    />
  );
}
