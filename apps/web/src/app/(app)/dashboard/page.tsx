import type { Metadata } from "next";

import { DashboardView } from "@/components/shell/dashboard-view";

export const metadata: Metadata = { title: "Overview · Ecolens" };

export default function DashboardPage() {
  return <DashboardView />;
}
