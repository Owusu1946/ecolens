import type { Metadata } from "next";
import { Suspense } from "react";

import { AlertQueue } from "@/components/alerts/alert-queue";
import { RequirePermission } from "@/components/shell/page";

export const metadata: Metadata = { title: "Alerts · Ecolens" };

export default function AlertsPage() {
  return (
    <RequirePermission permission="alert:read">
      <Suspense>
        <AlertQueue />
      </Suspense>
    </RequirePermission>
  );
}
