import { AnalyticsSettings } from "@raypx/analytics/client/settings";
import { AgentSettings } from "../features/tasks/settings";
import { DeviceSettings } from "@raypx/tasks/client";
import { taskClient } from "../features/tasks/client";
import { createFileRoute } from "@tanstack/react-router";
import { AppearanceSettings, LanguageSettings, SettingsPage } from "@raypx/blocks/settings";
import { useTranslations } from "@raypx/i18n/browser";
import { RemoteBoundary } from "../features/auth/components/remote-boundary";
import { authClient } from "../features/auth/client";
import { isDesktop } from "../lib/desktop";

export const Route = createFileRoute("/settings")({ component: SettingsRoute });

function SettingsRoute() {
  const t = useTranslations("settings");
  const session = authClient.useSession();
  const accountId = session.isPending || session.error ? null : session.data?.user.id;
  return (
    <SettingsPage title={t("title")} description={t("intro")} footnote={t("localHint")}>
      <AppearanceSettings />
      <LanguageSettings />
      <AgentSettings />
      <AnalyticsSettings />
      {accountId ? (
        <DeviceSettings client={taskClient} accountId={accountId} />
      ) : !isDesktop() ? (
        <RemoteBoundary>
          {(remoteAccount) => <DeviceSettings client={taskClient} accountId={remoteAccount} />}
        </RemoteBoundary>
      ) : null}
    </SettingsPage>
  );
}
