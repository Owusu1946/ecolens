import type { Metadata } from "next";
import { Suspense } from "react";

import { FieldScreen } from "@/components/field/field-screen";
import { RequirePermission } from "@/components/shell/page";

export const metadata: Metadata = { title: "Field reports · Ecolens" };

export default function FieldReportsPage() {
  return (
    <RequirePermission permission="field_report:read">
      <Suspense>
        <FieldScreen />
      </Suspense>
    </RequirePermission>
  );
}
