import { useEffect, useRef, type ReactNode } from "react";
import type { AnalyticsClient } from "@raypx-kit/analytics";
import { useTranslations } from "@raypx/i18n/browser";
import { analyticsPage, type AnalyticsPreferenceStore } from "../index.js";
import {
  AnalyticsPreferencesProvider,
  AnalyticsErrorBoundary,
  useAnalyticsPreferences,
} from "./provider.js";

function PageObserver({
  client,
  path,
  surface,
}: {
  client: AnalyticsClient;
  path: string;
  surface: "web" | "desktop";
}) {
  const { consent, ready } = useAnalyticsPreferences();
  const opened = useRef(false),
    previous = useRef<string | null>(null);
  const page = analyticsPage(path, surface);
  useEffect(() => {
    if (!ready || !consent.usage) {
      previous.current = null;
      return;
    }
    if (!opened.current) {
      opened.current = true;
      client.capture("app_opened");
    }
    if (previous.current !== page) {
      previous.current = page;
      client.capture("page_viewed", { page });
    }
  }, [client, page, consent.usage, ready]);
  return null;
}

/** Applications supply router state and their device-local preference store. */
export function AnalyticsApplication({
  client,
  store,
  configured,
  path,
  surface,
  children,
}: {
  client: AnalyticsClient;
  store: AnalyticsPreferenceStore;
  configured: boolean;
  path: string;
  surface: "web" | "desktop";
  children: ReactNode;
}) {
  const t = useTranslations("analytics");
  return (
    <AnalyticsPreferencesProvider client={client} store={store} configured={configured}>
      <AnalyticsErrorBoundary
        client={client}
        fallback={
          <p role="alert" className="p-8">
            {t("viewError")}
          </p>
        }
      >
        <PageObserver client={client} path={path} surface={surface} />
        {children}
      </AnalyticsErrorBoundary>
    </AnalyticsPreferencesProvider>
  );
}
