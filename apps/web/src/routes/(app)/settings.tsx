import { useTranslations } from "../../i18n.js";
import { AnalyticsSettings } from "@raypx/analytics/client/settings";
import { DeviceSettings } from "@raypx/tasks/client";
import { SessionBoundary, SignInGate } from "../../features/auth/components/session-boundary.js";
import { taskClient } from "../../features/tasks/client.js";
import { createFileRoute } from "@tanstack/react-router";
import { AppearanceSettings, LanguageSettings, SettingsPage } from "@raypx/blocks/settings";

export const Route = createFileRoute("/(app)/settings")({
  staticData: { page: { title: "common.settings", layout: "document" } },
  component: SettingsRoute,
});

function SettingsRoute() {
  const common = useTranslations("common");
  const t = useTranslations("settings");
  const g = useTranslations("guest");
  return (
    <SettingsPage title={common("settings")} footnote={t("localHint")}>
      <AppearanceSettings />
      <LanguageSettings />
      <AnalyticsSettings />
      <section aria-label={common("connectedComputers")}>
        <SessionBoundary
          guest={
            <div className="pt-2">
              <SignInGate title={common("connectedComputers")} description={g("computersHint")} />
            </div>
          }
        >
          {(accountId) => <DeviceSettings client={taskClient} accountId={accountId} />}
        </SessionBoundary>
      </section>
    </SettingsPage>
  );
}
