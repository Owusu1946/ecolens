import { RootProvider } from "fumadocs-ui/provider/next";

import "./global.css";
import type { Metadata } from "next";
import { Geist } from "next/font/google";

// Same typeface as the Ecolens app.
const geist = Geist({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Ecolens help", template: "%s · Ecolens help" },
  description:
    "How to use Ecolens: guides for analysts, regulators, field officers, responders and leadership.",
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={geist.className} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
