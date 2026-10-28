import type { Metadata } from "next";
import { Suspense } from "react";

import { ChooseInstitution } from "@/components/auth/choose-institution";

export const metadata: Metadata = { title: "Choose institution · Ecolens" };

export default function ChooseOrganizationPage() {
  return (
    <Suspense>
      <ChooseInstitution />
    </Suspense>
  );
}
