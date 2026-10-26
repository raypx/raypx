import { AnalyticsSettings } from "@raypx/analytics/client/settings";
import { DeviceSettings } from "@raypx/tasks/client";
import { SessionBoundary, SignInGate } from "../../features/auth/components/session-boundary";
import { taskClient } from "../../features/tasks/client";
import { createFileRoute } from "@tanstack/react-router";
import { AppearanceSettings, LanguageSettings, SettingsPage } from "@raypx/blocks/settings";
import { useTranslations } from "@raypx/i18n/browser";

export const Route = createFileRoute("/(app)/settings")({ component: SettingsRoute });

function SettingsRoute() {
  const t = useTranslations("settings");
  const g = useTranslations("guest");
  return (
    <SettingsPage title={t("title")} description={t("intro")} footnote={t("localHint")}>
      <AppearanceSettings />
      <LanguageSettings />
      <AnalyticsSettings />
      <section aria-label={g("computers")}>
        <SessionBoundary
          guest={
            <div className="mt-8 border-t border-border">
              <SignInGate title={g("computers")} description={g("computersHint")} />
            </div>
          }
        >
          {(accountId) => <DeviceSettings client={taskClient} accountId={accountId} />}
        </SessionBoundary>
      </section>
    </SettingsPage>
  );
}
