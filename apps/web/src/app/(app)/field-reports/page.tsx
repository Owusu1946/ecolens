import type { Metadata } from "next";

import { PlannedSection } from "@/components/shell/page";

export const metadata: Metadata = { title: "Field reports · Ecolens" };

export default function FieldreportsPage() {
  return (
    <PlannedSection
      title="Field reports"
      stage={"Observe"}
      permission="field_report:read"
      description="Observations from authorised field staff that confirm or reject alerts."
      plan={[
        "GPS-tagged observations with photos, compressed on the device",
        "Fully offline: reports queue on the phone and upload when there is signal",
        "Linked to the alert or incident they verify",
      ]}
    />
  );
}
