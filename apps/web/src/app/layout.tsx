import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";

import "../index.css";
import { Geist, Geist_Mono } from "next/font/google";

import Providers from "@/components/providers";
import PwaRegistration from "@/components/pwa-registration";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <PwaRegistration />

        <ClerkProvider
          signInUrl="/sign-in"
          signInFallbackRedirectUrl="/dashboard"
          taskUrls={{ "choose-organization": "/sign-in/tasks/choose-organization" }}
        >
          <Providers>{children}</Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
