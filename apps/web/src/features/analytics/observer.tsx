import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useAnalyticsPreferences } from "@raypx/analytics/client";
import { analyticsPage } from "@raypx/analytics";
import { analytics } from "./client";
export function AnalyticsObserver() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const { consent, ready } = useAnalyticsPreferences();
  const opened = useRef(false),
    previous = useRef<string | null>(null);
  const page = analyticsPage(path);
  useEffect(() => {
    if (!ready || !consent.usage) {
      previous.current = null;
      return;
    }
    if (!opened.current) {
      opened.current = true;
      analytics.capture("app_opened");
    }
    if (previous.current !== page) {
      previous.current = page;
      analytics.capture("page_viewed", { page });
    }
  }, [page, consent.usage, ready]);
  return null;
}
