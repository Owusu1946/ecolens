import type { Metadata } from "next";
import { Suspense } from "react";

import { MapScreen } from "@/components/map/map-screen";
import { RequirePermission } from "@/components/shell/page";

export const metadata: Metadata = { title: "Map · Ecolens" };

export default function MapPage() {
  return (
    <RequirePermission permission="alert:read">
      <Suspense>
        <MapScreen />
      </Suspense>
    </RequirePermission>
  );
}
