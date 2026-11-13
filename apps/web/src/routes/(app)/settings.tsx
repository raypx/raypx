import { useTranslations } from "../../i18n.js";
import { AnalyticsSettings } from "@raypx/analytics/client/settings";
import { createFileRoute } from "@tanstack/react-router";
import { AppearanceSettings, LanguageSettings, SettingsPage } from "@raypx/blocks/settings";

export const Route = createFileRoute("/(app)/settings")({
  staticData: { page: { title: "common.settings", layout: "document" } },
  component: SettingsRoute,
});

function SettingsRoute() {
  const common = useTranslations("common");
  const t = useTranslations("settings");
  return (
    <SettingsPage title={common("settings")} footnote={t("localHint")}>
      <AppearanceSettings />
      <LanguageSettings />
      <AnalyticsSettings />
    </SettingsPage>
  );
}
