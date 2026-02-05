"use client";

import { ThemeProvider } from "@raypx/ui/components/theme-provider";
import { Toaster } from "@raypx/ui/components/toast";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Messages, NextIntlClientProvider } from "next-intl";
import { useState } from "react";

export function Providers({
  children,
  messages,
  locale,
}: {
  children: React.ReactNode;
  messages: Messages;
  locale: string;
}) {
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
      <NextIntlClientProvider locale={locale} messages={messages}>
        <ThemeProvider defaultTheme="system">
          {children}
          <Toaster />
        </ThemeProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
