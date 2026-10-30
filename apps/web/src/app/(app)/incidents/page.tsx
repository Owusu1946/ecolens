import type { Metadata } from "next";
import { Suspense } from "react";

import { IncidentRegister } from "@/components/incidents/incident-register";
import { RequirePermission } from "@/components/shell/page";

export const metadata: Metadata = { title: "Incidents · Ecolens" };

export default function IncidentsPage() {
  return (
    <RequirePermission permission="incident:read">
      <Suspense>
        <IncidentRegister />
      </Suspense>
    </RequirePermission>
  );
}
