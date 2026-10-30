import type { Metadata } from "next";
import { Suspense } from "react";

import { AuditScreen } from "@/components/admin/audit-screen";
import { RequirePermission } from "@/components/shell/page";

export const metadata: Metadata = { title: "Audit trail · Ecolens" };

export default function AuditPage() {
  return (
    <RequirePermission permission="audit:read">
      <Suspense>
        <AuditScreen />
      </Suspense>
    </RequirePermission>
  );
}
