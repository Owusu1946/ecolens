"use client";

import { useAuth } from "@clerk/nextjs";
import { Toaster } from "@ecolens/ui/components/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useEffect } from "react";

import { setClerkAuthTokenGetter } from "@/utils/clerk-auth";
import { getQueryClient } from "@/utils/orpc";

import { ThemeProvider } from "./theme-provider";

function ClerkApiAuthBridge() {
  const { getToken } = useAuth();

  useEffect(() => {
    setClerkAuthTokenGetter(getToken);

    return () => {
      setClerkAuthTokenGetter(null);
    };
  }, [getToken]);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <ClerkApiAuthBridge />
        {children}
        <ReactQueryDevtools />
      </QueryClientProvider>
      <Toaster richColors />
    </ThemeProvider>
  );
}
