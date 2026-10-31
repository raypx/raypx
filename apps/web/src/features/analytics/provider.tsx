import type { ReactNode } from "react";
import { AnalyticsApplication } from "@raypx/analytics/client/application";
import { browserPreferenceStore } from "@raypx/analytics/browser";
import { useRouterState } from "@tanstack/react-router";
import { analytics, analyticsConfigured } from "./client";
const store = browserPreferenceStore();

export function AppAnalytics({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  return (
    <AnalyticsApplication
      client={analytics}
      store={store}
      configured={analyticsConfigured}
      path={path}
      surface="web"
    >
      {children}
    </AnalyticsApplication>
  );
}
