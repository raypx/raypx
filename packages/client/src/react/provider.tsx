import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

export interface ClientProviderProps {
  client: QueryClient;
  children: ReactNode;
}

/** Uses the caller's cache; TanStack Start's SSR integration can supply this provider instead. */
export function ClientProvider({ client, children }: ClientProviderProps) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
