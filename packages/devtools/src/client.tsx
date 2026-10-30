import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useLocale, useLanguagePreference } from "@raypx/i18n/browser";
import { useTheme } from "@raypx/ui/themes";
import { createSnapshotReader, type PageDiagnosticsSnapshot } from "./snapshot";
import { ensureEmbeddedClient, panelStore } from "./runtime";
import { DiagnosticsPanel } from "./panel";

export type { PageDiagnosticsSnapshot } from "./snapshot";
export interface DevtoolsBridgeProps {
  surface: PageDiagnosticsSnapshot["surface"];
  stylesheetUrl: string;
}
export function DevtoolsBridge({ surface, stylesheetUrl }: DevtoolsBridgeProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const locale = useLocale();
  const { preference: localePreference } = useLanguagePreference();
  const { theme, resolvedTheme } = useTheme();
  const target = useSyncExternalStore(
    panelStore.subscribe,
    panelStore.getSnapshot,
    panelStore.getServerSnapshot,
  );
  const read = useMemo(
    () =>
      createSnapshotReader({
        router,
        queryClient,
        surface,
        preferences: () => ({ locale, localePreference, theme, resolvedTheme }),
      }),
    [router, queryClient, surface, locale, localePreference, theme, resolvedTheme],
  );
  useEffect(() => {
    ensureEmbeddedClient();
  }, []);
  useEffect(() => {
    target?.querySelector("[data-raypx-devtools-waiting]")?.remove();
  }, [target]);
  return target
    ? createPortal(
        <DiagnosticsPanel
          read={read}
          locale={locale}
          resolvedTheme={resolvedTheme}
          stylesheetUrl={stylesheetUrl}
        />,
        target,
      )
    : null;
}
