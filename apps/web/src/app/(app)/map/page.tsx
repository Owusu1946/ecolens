import type { Metadata } from "next";

import { PlannedSection } from "@/components/shell/page";

export const metadata: Metadata = { title: "Map · Ecolens" };

export default function MapPage() {
  return (
    <PlannedSection
      title="Map"
      stage={"Interpret"}
      permission="alert:read"
      description="Every signal around a common location, with source, date, coverage and confidence on each layer."
      plan={[
        "3D globe and 2D map with instant switching that keeps location, layers and selection",
        "Basins, river reaches, concessions and reserves (labelled illustrative where they are)",
        "Satellite imagery, thermal and aerosol overlays with provenance",
        "Alerts and field reports placed on the map",
      ]}
    />
  );
}
