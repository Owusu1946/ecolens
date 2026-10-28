import type { Metadata } from "next";

import { PlannedSection } from "@/components/shell/page";

export const metadata: Metadata = { title: "Reports · Ecolens" };

export default function ReportsPage() {
  return (
    <PlannedSection
      title="Reports"
      stage={"Report"}
      permission="report:read"
      description="One-page assessment reports and the pilot's success measures."
      plan={[
        "Assessment report: evidence, confidence, validation status, responsible institution and action",
        "PDF export that matches the screen",
        "Detection latency, false-alert rate and response speed",
      ]}
    />
  );
}
