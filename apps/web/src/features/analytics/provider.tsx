import type { ReactNode } from "react";
import { AnalyticsPreferencesProvider, AnalyticsErrorBoundary } from "@raypx/analytics/client";
import { browserPreferenceStore } from "@raypx/analytics/browser";
import { useTranslations } from "@raypx/i18n/browser";
import { analytics, analyticsConfigured } from "./client";
import { AnalyticsObserver } from "./observer";
const store = browserPreferenceStore();

export function AppAnalytics({ children }: { children: ReactNode }) {
  const t = useTranslations("analytics");
  return (
    <AnalyticsPreferencesProvider client={analytics} store={store} configured={analyticsConfigured}>
      <AnalyticsErrorBoundary
        client={analytics}
        fallback={
          <p role="alert" className="p-8">
            {t("viewError")}
          </p>
        }
      >
        <AnalyticsObserver />
        {children}
      </AnalyticsErrorBoundary>
    </AnalyticsPreferencesProvider>
  );
}
