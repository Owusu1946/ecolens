import type { Metadata } from "next";

import { PlannedSection } from "@/components/shell/page";

export const metadata: Metadata = { title: "Administration · Ecolens" };

export default function AdministrationPage() {
  return (
    <PlannedSection
      title="Administration"
      stage={null}
      permission="member:manage"
      description="Institutions, members, data sources and the audit trail."
      plan={[
        "Members and roles per institution",
        "Data sources: steward, freshness and limitations",
        "Audit trail of every status change",
      ]}
    />
  );
}
