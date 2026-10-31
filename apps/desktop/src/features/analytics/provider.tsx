import type { ReactNode } from "react";
import { AnalyticsApplication } from "@raypx/analytics/client/application";
import { useRouterState } from "@tanstack/react-router";
import { analytics, analyticsConfigured } from "./client";
import { desktopAnalyticsStore } from "./store";
const store = desktopAnalyticsStore();

export function AppAnalytics({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  return (
    <AnalyticsApplication
      client={analytics}
      store={store}
      configured={analyticsConfigured}
      path={path}
      surface="desktop"
    >
      {children}
    </AnalyticsApplication>
  );
}
