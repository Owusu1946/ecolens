import type { Metadata } from "next";
import { Suspense } from "react";

import { ReportsScreen } from "@/components/reports/reports-screen";
import { RequirePermission } from "@/components/shell/page";

export const metadata: Metadata = { title: "Reports · Ecolens" };

export default function ReportsPage() {
  return (
    <RequirePermission permission="report:read">
      <Suspense>
        <ReportsScreen />
      </Suspense>
    </RequirePermission>
  );
}
