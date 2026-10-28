import type { Metadata } from "next";

import { PlannedSection } from "@/components/shell/page";

export const metadata: Metadata = { title: "Alerts · Ecolens" };

export default function AlertsPage() {
  return (
    <PlannedSection
      title="Alerts"
      stage={"Validate"}
      permission="alert:read"
      description="Potential changes flagged by agreed rules. An alert is a prompt for review, not proof of wrongdoing."
      plan={[
        "Queue by confidence, age and basin",
        "Evidence trail: observations, sources, confidence and known limitations",
        "Human validation: confirmed, rejected or unresolved, with the reason recorded",
        "Works offline: decisions are saved on the device and synced",
      ]}
    />
  );
}
