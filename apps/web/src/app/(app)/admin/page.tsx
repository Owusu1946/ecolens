import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminScreen } from "@/components/admin/admin-screen";
import { RequirePermission } from "@/components/shell/page";

export const metadata: Metadata = { title: "Administration · Ecolens" };

export default function AdministrationPage() {
  return (
    <RequirePermission permission="member:manage">
      <Suspense>
        <AdminScreen />
      </Suspense>
    </RequirePermission>
  );
}
