"use client";

import { ThemeProvider } from "@raypx/ui/components/theme-provider";
import { Toaster } from "@raypx/ui/components/toast";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system">
        {children}
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
