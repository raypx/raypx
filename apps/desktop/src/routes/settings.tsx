import { AnalyticsSettings } from "@raypx/analytics/client/settings";
import { AgentSettings } from "../features/tasks/settings";
import { DeviceSettings } from "@raypx/tasks/client";
import { authClient } from "../features/auth/client";
import { taskClient } from "../features/tasks/client";
import { createFileRoute } from "@tanstack/react-router";
import { AppearanceSettings, LanguageSettings, SettingsPage } from "@raypx/blocks/settings";
import { useTranslations } from "@raypx/i18n/browser";

export const Route = createFileRoute("/settings")({ component: SettingsRoute });

function SettingsRoute() {
  const t = useTranslations("settings");
  const session = authClient.useSession();
  return (
    <SettingsPage title={t("title")} description={t("intro")} footnote={t("localHint")}>
      <AppearanceSettings />
      <LanguageSettings />
      <AgentSettings key={session.data?.user.id ?? "signed-out"} />
      <AnalyticsSettings />
      <DeviceSettings
        client={taskClient}
        accountId={session.data?.user.id ?? null}
        pending={session.isPending}
      />
    </SettingsPage>
  );
}
