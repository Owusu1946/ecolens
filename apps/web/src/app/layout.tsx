import { ClerkProvider } from "@clerk/nextjs";
import { SerwistProvider } from "@serwist/turbopack/react";
import type { Metadata, Viewport } from "next";

import "../index.css";
import { Geist, Geist_Mono } from "next/font/google";

import Providers from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ecolens",
  description:
    "Environmental intelligence for the Western Region pilot: satellite, sensor, agency and field evidence on one shared map.",
  applicationName: "Ecolens",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* Off in development so stale cached pages never mask code changes. */}
        <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"}>
          <ClerkProvider
            signInUrl="/sign-in"
            signInFallbackRedirectUrl="/dashboard"
            taskUrls={{ "choose-organization": "/sign-in/tasks/choose-organization" }}
          >
            <Providers>{children}</Providers>
          </ClerkProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
